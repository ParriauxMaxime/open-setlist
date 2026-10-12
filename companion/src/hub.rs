//! What the Wi-Fi server and the Bluetooth peripheral share: the MIDI output, the counters
//! behind the status page, and the leader's position.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::lock;
use crate::midi::{Message, MidiOut, NoOutput};
use crate::position::Positions;

const RECENT: usize = 20;

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

#[derive(Clone, Debug, Serialize)]
pub struct Batch {
    pub at: u64,
    pub from: String,
    pub via: Via,
    pub messages: Vec<Message>,
}

pub struct Hub {
    out: Arc<dyn MidiOut>,
    sent: AtomicU64,
    recent: Mutex<VecDeque<Batch>>,
    bluetooth: Mutex<Bluetooth>,
    pub positions: Positions,
}

impl Hub {
    pub fn new(out: Arc<dyn MidiOut>, bluetooth: Bluetooth) -> Self {
        Self {
            out,
            sent: AtomicU64::new(0),
            recent: Mutex::new(VecDeque::with_capacity(RECENT)),
            bluetooth: Mutex::new(bluetooth),
            positions: Positions::default(),
        }
    }

    /// Plays a batch on the MIDI output and keeps it for the status page.
    pub fn play(&self, messages: Vec<Message>, from: String, via: Via) -> Result<usize, NoOutput> {
        self.out.send(&messages)?;
        let count = messages.len();
        if count > 0 {
            self.sent.fetch_add(count as u64, Ordering::Relaxed);
            let mut recent = lock(&self.recent);
            recent.truncate(RECENT - 1);
            recent.push_front(Batch {
                at: unix_ms(),
                from,
                via,
                messages,
            });
        }
        Ok(count)
    }

    pub fn midi_out(&self) -> Option<String> {
        self.out.name()
    }

    pub fn sent(&self) -> u64 {
        self.sent.load(Ordering::Relaxed)
    }

    /// The last batches, newest first.
    pub fn recent(&self) -> Vec<Batch> {
        lock(&self.recent).iter().cloned().collect()
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

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeOut;

    #[test]
    fn plays_counts_and_remembers_a_batch() {
        let out = Arc::new(FakeOut::default());
        let hub = Hub::new(out.clone(), Bluetooth::Off);
        let batch = vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6]];
        assert_eq!(hub.play(batch.clone(), "Keys".into(), Via::Wifi), Ok(2));
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
            hub.play(vec![vec![0xC0, program]], "Drums".into(), Via::Bluetooth)
                .unwrap();
        }
        let recent = hub.recent();
        assert_eq!(recent.len(), 20);
        assert_eq!(recent[0].messages, vec![vec![0xC0, 24]]);
        assert_eq!(recent[19].messages, vec![vec![0xC0, 5]]);
        assert_eq!(hub.sent(), 25);
    }

    #[test]
    fn counts_nothing_without_an_output() {
        let out = Arc::new(FakeOut::default());
        out.unplug();
        let hub = Hub::new(out, Bluetooth::Off);
        assert_eq!(
            hub.play(vec![vec![0xC0, 1]], "Keys".into(), Via::Wifi),
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
