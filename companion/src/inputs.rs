//! The MIDI input the gear answers on: a virtual port of our own on macOS and Linux, which
//! Ableton sees as an output; on Windows an existing loopback port, found by name.

use std::sync::{Arc, Mutex};

use midir::{MidiInput, MidiInputConnection, MidiInputPort};

use crate::feedback::Feedback;
use crate::lock;
use crate::midi::{PORT_NAME, find_port};

/// On Windows, the loopback port Ableton sends to. Not the one the companion plays on: a
/// loopback port gives back what is written to it, and the companion would hear itself.
#[cfg(not(unix))]
const WINDOWS_FEEDBACK_PORT: &str = "feedback";

struct Port {
    name: String,
    // Dropping it closes the port.
    _connection: MidiInputConnection<Arc<Feedback>>,
}

pub struct Inputs {
    /// Part of the name of an existing input, or `None` for the default one.
    wanted: Option<String>,
    feedback: Arc<Feedback>,
    port: Mutex<Option<Port>>,
}

impl Inputs {
    pub fn new(wanted: Option<String>, feedback: Arc<Feedback>) -> Self {
        Self {
            wanted,
            feedback,
            port: Mutex::new(None),
        }
    }

    pub fn name(&self) -> Option<String> {
        lock(&self.port).as_ref().map(|port| port.name.clone())
    }

    /// Opens the port if it is not open. Called again every few seconds: a loopback port can
    /// show up late.
    pub fn refresh(&self) {
        if lock(&self.port).is_some() {
            return;
        }
        let found = match &self.wanted {
            Some(wanted) => self.open(|names| find_port(names, wanted)),
            None => self.open_default(),
        };
        *lock(&self.port) = found;
    }

    fn open(&self, pick: impl FnOnce(&[String]) -> Option<usize>) -> Option<Port> {
        let midi = MidiInput::new(PORT_NAME).ok()?;
        let ports = midi.ports();
        let mut names = names(&midi, &ports);
        let index = pick(&names)?;
        let connection = midi
            .connect(ports.get(index)?, PORT_NAME, receive, self.feedback.clone())
            .ok()?;
        Some(Port {
            name: names.swap_remove(index),
            _connection: connection,
        })
    }

    #[cfg(unix)]
    fn open_default(&self) -> Option<Port> {
        use midir::os::unix::VirtualInput;

        let connection = MidiInput::new(PORT_NAME)
            .ok()?
            .create_virtual(PORT_NAME, receive, self.feedback.clone())
            .ok()?;
        Some(Port {
            name: PORT_NAME.to_string(),
            _connection: connection,
        })
    }

    #[cfg(not(unix))]
    fn open_default(&self) -> Option<Port> {
        self.open(|names| find_port(names, WINDOWS_FEEDBACK_PORT))
    }
}

fn receive(_at: u64, message: &[u8], feedback: &mut Arc<Feedback>) {
    feedback.receive(message.to_vec());
}

fn names(midi: &MidiInput, ports: &[MidiInputPort]) -> Vec<String> {
    ports
        .iter()
        .map(|port| midi.port_name(port).unwrap_or_default())
        .collect()
}
