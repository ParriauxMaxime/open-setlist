//! Which tablets are on: each one tells who it is and what it shows every few seconds, and
//! is forgotten once it falls silent. The app's Companion page lists them.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::time::{Duration, Instant};

use serde_json::{Map, Value, json};

use crate::latest::Latest;
use crate::unix_ms;

/// A tablet silent for this long has left: closed, asleep or off the Wi-Fi.
pub const SILENCE: Duration = Duration::from_secs(15);
const MAX_DEVICES: usize = 64;
const MAX_ID: usize = 64;

#[derive(Clone)]
struct Device {
    /// What the tablet sent, relayed as it came, so that the app can add to it.
    report: Map<String, Value>,
    address: Option<IpAddr>,
    last_seen: u64,
    heard: Instant,
}

type Devices = BTreeMap<String, Device>;

pub struct Presence {
    silence: Duration,
    devices: Latest<Devices>,
}

impl Presence {
    pub fn new(silence: Duration) -> Self {
        Self {
            silence,
            devices: Latest::default(),
        }
    }

    pub fn silence(&self) -> Duration {
        self.silence
    }

    /// Records what a tablet reported, and returns the new number; `None` when the report
    /// does not name a device. Every report counts, so that "last seen" stays true.
    pub fn report(&self, report: Value, address: Option<IpAddr>) -> Option<u64> {
        let Value::Object(report) = report else {
            return None;
        };
        let id = report.get("id")?.as_str()?.to_string();
        let named = report.get("name").is_some_and(Value::is_string);
        if id.trim().is_empty() || id.chars().count() > MAX_ID || !named {
            return None;
        }
        let device = Device {
            report,
            address,
            last_seen: unix_ms(),
            heard: Instant::now(),
        };
        Some(self.devices.update(|devices| {
            let devices = devices.get_or_insert_with(Devices::new);
            if !devices.contains_key(&id) && devices.len() >= MAX_DEVICES {
                let oldest = devices
                    .iter()
                    .min_by_key(|(_, device)| device.heard)
                    .map(|(id, _)| id.clone());
                if let Some(oldest) = oldest {
                    devices.remove(&oldest);
                }
            }
            devices.insert(id, device);
        }))
    }

    /// Forgets the tablets that fell silent, and wakes the waiters when there were some.
    pub fn forget_silent(&self) {
        let now = Instant::now();
        self.devices.update_if(|devices| {
            let Some(devices) = devices else {
                return false;
            };
            let before = devices.len();
            devices.retain(|_, device| now.duration_since(device.heard) < self.silence);
            devices.len() != before
        });
    }

    pub fn current(&self) -> (u64, Vec<Value>) {
        let (seq, devices) = self.devices.current();
        (seq, values(devices.unwrap_or_default()))
    }

    /// The devices once they changed after `after`, or `None` when `wait` runs out first.
    pub fn next(&self, after: u64, wait: Duration) -> Option<(u64, Vec<Value>)> {
        self.devices
            .next(after, wait)
            .map(|(seq, devices)| (seq, values(devices)))
    }
}

fn values(devices: Devices) -> Vec<Value> {
    devices
        .into_values()
        .map(|device| {
            let mut report = device.report;
            report.insert("lastSeen".to_string(), json!(device.last_seen));
            report.insert("address".to_string(), json!(device.address));
            Value::Object(report)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::thread;

    use super::*;

    fn tablet(id: &str, page: &str) -> Value {
        json!({"id": id, "name": "Keys · iPad", "page": page})
    }

    #[test]
    fn keeps_one_entry_per_device_with_when_it_was_last_seen() {
        let presence = Presence::new(SILENCE);
        let before = unix_ms();
        assert_eq!(presence.report(tablet("a", "Catalog"), None), Some(1));
        assert_eq!(presence.report(tablet("b", "Catalog"), None), Some(2));
        assert_eq!(presence.report(tablet("a", "Perform"), None), Some(3));
        let (seq, devices) = presence.current();
        assert_eq!(seq, 3);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0]["page"], "Perform");
        assert_eq!(devices[0]["address"], Value::Null);
        assert!(devices[0]["lastSeen"].as_u64().unwrap() >= before);
    }

    #[test]
    fn refuses_a_report_that_names_no_device() {
        let presence = Presence::new(SILENCE);
        for report in [
            json!({"name": "Keys"}),
            json!({"id": "", "name": "Keys"}),
            json!({"id": 3, "name": "Keys"}),
            json!({"id": "a"}),
            json!({"id": "x".repeat(65), "name": "Keys"}),
            json!(["a"]),
        ] {
            assert_eq!(presence.report(report, None), None);
        }
        assert_eq!(presence.current(), (0, vec![]));
    }

    #[test]
    fn forgets_a_silent_device_and_tells_the_waiters() {
        let presence = Presence::new(Duration::from_millis(50));
        presence.report(tablet("a", "Catalog"), None);
        presence.forget_silent();
        assert_eq!(presence.current().0, 1);
        thread::sleep(Duration::from_millis(80));
        presence.report(tablet("b", "Catalog"), None);
        presence.forget_silent();
        let (seq, devices) = presence.current();
        assert_eq!(seq, 3);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0]["id"], "b");
    }

    #[test]
    fn makes_room_by_forgetting_the_longest_silent() {
        let presence = Presence::new(SILENCE);
        for index in 0..=MAX_DEVICES {
            presence.report(tablet(&format!("{index:03}"), "Catalog"), None);
        }
        let devices = presence.current().1;
        assert_eq!(devices.len(), MAX_DEVICES);
        assert_eq!(devices[0]["id"], "001");
    }
}
