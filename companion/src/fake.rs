//! A MIDI output that only remembers what it was sent, for the tests.

use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::lock;
use crate::midi::{Message, MidiOut, NoOutput};

#[derive(Default)]
pub struct FakeOut {
    played: Mutex<Vec<Message>>,
    unplugged: AtomicBool,
}

impl FakeOut {
    pub fn played(&self) -> Vec<Message> {
        lock(&self.played).clone()
    }

    pub fn unplug(&self) {
        self.unplugged.store(true, Ordering::Relaxed);
    }
}

impl MidiOut for FakeOut {
    fn name(&self) -> Option<String> {
        (!self.unplugged.load(Ordering::Relaxed)).then(|| "Fake".to_string())
    }

    fn send(&self, messages: &[Message]) -> Result<(), NoOutput> {
        if self.unplugged.load(Ordering::Relaxed) {
            return Err(NoOutput);
        }
        lock(&self.played).extend_from_slice(messages);
        Ok(())
    }
}
