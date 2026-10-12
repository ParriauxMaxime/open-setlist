//! The Bluetooth side: a standard BLE MIDI peripheral, so that the app talks to this
//! computer the way it talks to any BLE MIDI device.

#[cfg_attr(windows, path = "windows.rs")]
#[cfg_attr(not(windows), path = "unix.rs")]
mod backend;
mod packet;

use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;
use std::thread;

use crate::hub::{Bluetooth, Hub, Via};

// The service and its only characteristic, as set by the BLE MIDI specification.
const SERVICE: u128 = 0x03B80E5A_EDE8_4B33_A751_6CE34EC4C700;
const CHARACTERISTIC: u128 = 0x7772E5DB_3868_4112_A1A9_F2669D106BF3;

const LABEL: &str = "Bluetooth";

/// Starts the peripheral on a thread of its own. Whatever happens there, the rest of the
/// program goes on without Bluetooth.
pub fn start(hub: Arc<Hub>) {
    let on_thread = hub.clone();
    let started = thread::Builder::new()
        .name("bluetooth".to_string())
        .spawn(move || {
            let hub = on_thread;
            let reason = match catch_unwind(AssertUnwindSafe(|| backend::run(&hub))) {
                Ok(Ok(())) => "it stopped".to_string(),
                Ok(Err(reason)) => reason,
                Err(_) => "it stopped unexpectedly".to_string(),
            };
            unavailable(&hub, &reason);
        });
    if started.is_err() {
        unavailable(&hub, "it could not start");
    }
}

/// Tells the status page and the console that tablets can see this computer.
fn ready(hub: &Hub) {
    if hub.set_bluetooth(Bluetooth::Advertising) {
        println!("Bluetooth: ready.");
    }
}

pub fn unavailable(hub: &Hub, reason: &str) {
    if hub.set_bluetooth(Bluetooth::Unavailable) {
        println!("Bluetooth: unavailable ({reason}). Wi-Fi works without it.");
    }
}

/// A packet a tablet wrote to the characteristic. Without a MIDI output there is nobody to
/// tell: the status page already shows that the output is missing.
fn received(hub: &Hub, packet: &[u8]) {
    let messages = packet::parse(packet);
    if !messages.is_empty() {
        let _ = hub.play(messages, LABEL.to_string(), Via::Bluetooth);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeOut;

    #[test]
    fn a_packet_from_a_tablet_becomes_a_batch_received_over_bluetooth() {
        let out = Arc::new(FakeOut::default());
        let hub = Hub::new(out.clone(), Bluetooth::Advertising);
        received(&hub, &[0x80, 0x80, 0xB0, 21, 0, 20, 6]);
        assert_eq!(out.played(), vec![vec![0xB0, 21, 0], vec![0xB0, 20, 6]]);
        let recent = hub.recent();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].via, Via::Bluetooth);
        assert_eq!(recent[0].from, "Bluetooth");
    }

    #[test]
    fn a_packet_without_a_message_or_without_an_output_changes_nothing() {
        let out = Arc::new(FakeOut::default());
        let hub = Hub::new(out.clone(), Bluetooth::Advertising);
        received(&hub, &[0x80, 0x80, 0xF8]);
        received(&hub, &[]);
        out.unplug();
        received(&hub, &[0x80, 0x80, 0xB0, 20, 6]);
        assert!(hub.recent().is_empty());
        assert_eq!(hub.sent(), 0);
    }

    #[test]
    fn bluetooth_coming_and_going_shows_in_the_status() {
        let hub = Hub::new(Arc::new(FakeOut::default()), Bluetooth::Starting);
        ready(&hub);
        assert_eq!(hub.bluetooth(), Bluetooth::Advertising);
        unavailable(&hub, "it is turned off");
        assert_eq!(hub.bluetooth(), Bluetooth::Unavailable);
    }
}
