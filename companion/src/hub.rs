//! What the Wi-Fi server and the Bluetooth peripheral share: the MIDI output, the counters
//! and the log behind the status page, the leader's position, the tablets that are on and
//! what the gear sends back.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::feedback::Feedback;
use crate::latest::Latest;
use crate::midi::{Message, MidiOut, NoOutput};
use crate::position::Positions;
use crate::presence::{Presence, SILENCE};
use crate::{lock, unix_ms};

/// Batches on the status page.
const RECENT: usize = 20;
/// Batches in the log the app's Companion page reads.
const LOG: usize = 50;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Via {
    Wifi,
    Bluetooth,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Bluetooth {
    Advertising,
    Off,
    Unavailable,
    /// Not known yet: nothing to tell the person at the computer, and not usable either.
    #[serde(rename = "unavailable")]
    Starting,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Batch {
    /// Numbered from 1 since the program started.
    pub seq: u64,
    pub at: u64,
    pub from: String,
    /// The id of the tablet, when it gave one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
    pub via: Via,
    pub messages: Vec<Message>,
}

/// Who a batch came from.
pub struct Sender {
    /// What the status page shows: the tablet's label, or its address.
    pub from: String,
    pub device: Option<String>,
    pub via: Via,
}

pub struct Hub {
    out: Arc<dyn MidiOut>,
    started: Instant,
    sent: AtomicU64,
    log: Latest<VecDeque<Batch>>,
    bluetooth: Mutex<Bluetooth>,
    midi_in: Mutex<Option<String>>,
    pub positions: Positions,
    pub presence: Presence,
    pub feedback: Arc<Feedback>,
}

impl Hub {
    pub fn new(out: Arc<dyn MidiOut>, bluetooth: Bluetooth) -> Self {
        Self {
            out,
            started: Instant::now(),
            sent: AtomicU64::new(0),
            log: Latest::default(),
            bluetooth: Mutex::new(bluetooth),
            midi_in: Mutex::new(None),
            positions: Positions::default(),
            presence: Presence::new(SILENCE),
            feedback: Arc::default(),
        }
    }

    /// Forgets a silent tablet after `silence` instead of 15 s.
    pub fn forgetting_after(mut self, silence: Duration) -> Self {
        self.presence = Presence::new(silence);
        self
    }

    /// Plays a batch on the MIDI output and keeps it for the status page and the log.
    pub fn play(&self, messages: Vec<Message>, sender: Sender) -> Result<usize, NoOutput> {
        self.out.send(&messages)?;
        let count = messages.len();
        if count > 0 {
            self.sent.fetch_add(count as u64, Ordering::Relaxed);
            self.log.update(|log| {
                let log = log.get_or_insert_with(|| VecDeque::with_capacity(LOG));
                let seq = log.front().map_or(0, |batch| batch.seq) + 1;
                log.truncate(LOG - 1);
                log.push_front(Batch {
                    seq,
                    at: unix_ms(),
                    from: sender.from,
                    device: sender.device,
                    via: sender.via,
                    messages,
                });
            });
        }
        Ok(count)
    }

    pub fn midi_out(&self) -> Option<String> {
        self.out.name()
    }

    /// The input the gear answers on, once it is open.
    pub fn midi_in(&self) -> Option<String> {
        lock(&self.midi_in).clone()
    }

    pub fn set_midi_in(&self, name: Option<String>) {
        *lock(&self.midi_in) = name;
    }

    pub fn sent(&self) -> u64 {
        self.sent.load(Ordering::Relaxed)
    }

    /// The last batches for the status page, newest first.
    pub fn recent(&self) -> Vec<Batch> {
        let (_, log) = self.log.current();
        log.unwrap_or_default().into_iter().take(RECENT).collect()
    }

    /// The whole log, newest first, once it is newer than `after`; `None` when `wait` runs
    /// out first.
    pub fn next_log(&self, after: u64, wait: Duration) -> Option<(u64, Vec<Batch>)> {
        self.log
            .next(after, wait)
            .map(|(seq, log)| (seq, log.into()))
    }

    pub fn uptime(&self) -> Duration {
        self.started.elapsed()
    }

    pub fn bluetooth(&self) -> Bluetooth {
        *lock(&self.bluetooth)
    }

    /// Returns whether the state changed.
    pub fn set_bluetooth(&self, state: Bluetooth) -> bool {
        let mut current = lock(&self.bluetooth);
        let changed = *current != state;
        *current = state;
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeOut;

    fn sender(from: &str, via: Via) -> Sender {
        Sender {
            from: from.to_string(),
            device: None,
            via,
        }
    }

    #[test]
    fn plays_counts_and_remembers_a_batch() {
        let out = Arc::new(FakeOut::default());
        let hub = Hub::new(out.clone(), Bluetooth::Off);
        let batch = vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6]];
        assert_eq!(hub.play(batch.clone(), sender("Keys", Via::Wifi)), Ok(2));
        assert_eq!(out.played(), batch);
        assert_eq!(hub.sent(), 2);
        let recent = hub.recent();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].from, "Keys");
        assert_eq!(recent[0].via, Via::Wifi);
        assert_eq!(recent[0].messages, batch);
        assert!(recent[0].at > 1_700_000_000_000);
    }

    #[test]
    fn keeps_the_last_twenty_batches_newest_first() {
        let hub = Hub::new(Arc::new(FakeOut::default()), Bluetooth::Off);
        for program in 0..25 {
            hub.play(vec![vec![0xC0, program]], sender("Drums", Via::Bluetooth))
                .unwrap();
        }
        let recent = hub.recent();
        assert_eq!(recent.len(), 20);
        assert_eq!(recent[0].messages, vec![vec![0xC0, 24]]);
        assert_eq!(recent[19].messages, vec![vec![0xC0, 5]]);
        assert_eq!(hub.sent(), 25);
    }

    #[test]
    fn logs_the_last_fifty_batches_numbered_newest_first() {
        let hub = Hub::new(Arc::new(FakeOut::default()), Bluetooth::Off);
        for program in 0..60 {
            hub.play(vec![vec![0xC0, program]], sender("Drums", Via::Wifi))
                .unwrap();
        }
        hub.play(vec![], sender("Drums", Via::Wifi)).unwrap();
        let (seq, log) = hub.next_log(0, Duration::ZERO).unwrap();
        assert_eq!(seq, 60);
        assert_eq!(log.len(), 50);
        assert_eq!((log[0].seq, &log[0].messages), (60, &vec![vec![0xC0, 59]]));
        assert_eq!(log[49].seq, 11);
        assert_eq!(hub.next_log(60, Duration::ZERO), None);
    }

    #[test]
    fn counts_nothing_without_an_output() {
        let out = Arc::new(FakeOut::default());
        out.unplug();
        let hub = Hub::new(out, Bluetooth::Off);
        assert_eq!(
            hub.play(vec![vec![0xC0, 1]], sender("Keys", Via::Wifi)),
            Err(NoOutput)
        );
        assert_eq!(hub.sent(), 0);
        assert!(hub.recent().is_empty());
        assert_eq!(hub.midi_out(), None);
    }

    #[test]
    fn reports_bluetooth_changes_once() {
        let hub = Hub::new(Arc::new(FakeOut::default()), Bluetooth::Unavailable);
        assert!(hub.set_bluetooth(Bluetooth::Advertising));
        assert!(!hub.set_bluetooth(Bluetooth::Advertising));
        assert_eq!(hub.bluetooth(), Bluetooth::Advertising);
    }
}
