//! The real MIDI outputs: the port Ableton listens to, and the hardware that gets a copy.

use std::sync::Mutex;

use midir::{MidiOutput, MidiOutputConnection, MidiOutputPort};

use crate::lock;
use crate::midi::{Message, MidiOut, NoOutput, PORT_NAME, find_port};

struct Port {
    name: String,
    connection: MidiOutputConnection,
}

impl Port {
    fn send(&mut self, messages: &[Message]) -> bool {
        messages
            .iter()
            .all(|message| self.connection.send(message).is_ok())
    }
}

/// One output: how it is found, and the port once it is open.
struct Output {
    /// Part of the name of an existing output, or `None` for the default one.
    wanted: Option<String>,
    port: Mutex<Option<Port>>,
}

impl Output {
    fn new(wanted: Option<String>) -> Self {
        Self {
            wanted,
            port: Mutex::new(None),
        }
    }

    fn name(&self) -> Option<String> {
        lock(&self.port).as_ref().map(|port| port.name.clone())
    }

    /// Opens the port if it is not open, unless it is the one named `taken`. The lock is
    /// not held while the system is searched, so that sending never waits for it.
    fn open(&self, taken: Option<&str>) {
        if lock(&self.port).is_some() {
            return;
        }
        let found = match &self.wanted {
            Some(wanted) => open(|names| find_port(names, wanted)),
            None => open_default(),
        };
        *lock(&self.port) = found.filter(|port| Some(port.name.as_str()) != taken);
    }

    /// A port that fails is closed, so that it is looked for again.
    fn send(&self, messages: &[Message]) -> bool {
        let mut port = lock(&self.port);
        let sent = port.as_mut().is_some_and(|port| port.send(messages));
        if !sent {
            *port = None;
        }
        sent
    }
}

pub struct Ports {
    main: Output,
    copies: Vec<Output>,
}

impl Ports {
    /// `wanted` names an existing output to use instead of the default one; every message
    /// is also sent to the outputs named in `copies`.
    pub fn new(wanted: Option<String>, copies: Vec<String>) -> Self {
        Self {
            main: Output::new(wanted),
            copies: copies
                .into_iter()
                .map(|wanted| Output::new(Some(wanted)))
                .collect(),
        }
    }

    /// Opens what is not open yet. A port can show up late (loopMIDI started afterwards, a
    /// pedalboard plugged in) or go away, so this is called again every few seconds.
    pub fn refresh(&self) {
        self.main.open(None);
        let main = self.main.name();
        for copy in &self.copies {
            copy.open(main.as_deref());
        }
    }

    /// What was asked for with `--also`, and the output found for it.
    pub fn copies(&self) -> Vec<(String, Option<String>)> {
        self.copies
            .iter()
            .map(|copy| (copy.wanted.clone().unwrap_or_default(), copy.name()))
            .collect()
    }
}

impl MidiOut for Ports {
    fn name(&self) -> Option<String> {
        self.main.name()
    }

    fn send(&self, messages: &[Message]) -> Result<(), NoOutput> {
        if !self.main.send(messages) {
            return Err(NoOutput);
        }
        for copy in &self.copies {
            copy.send(messages);
        }
        Ok(())
    }
}

/// Names of the outputs that exist on this computer.
pub fn list() -> Vec<String> {
    MidiOutput::new(PORT_NAME)
        .map(|midi| names(&midi, &midi.ports()))
        .unwrap_or_default()
}

fn names(midi: &MidiOutput, ports: &[MidiOutputPort]) -> Vec<String> {
    ports
        .iter()
        .map(|port| midi.port_name(port).unwrap_or_default())
        .collect()
}

fn open(pick: impl FnOnce(&[String]) -> Option<usize>) -> Option<Port> {
    let midi = MidiOutput::new(PORT_NAME).ok()?;
    let ports = midi.ports();
    let mut names = names(&midi, &ports);
    let index = pick(&names)?;
    let connection = midi.connect(ports.get(index)?, PORT_NAME).ok()?;
    Some(Port {
        name: names.swap_remove(index),
        connection,
    })
}

/// A virtual port of our own, which other programs see as a MIDI input.
#[cfg(unix)]
fn open_default() -> Option<Port> {
    use midir::os::unix::VirtualOutput;

    let connection = MidiOutput::new(PORT_NAME)
        .ok()?
        .create_virtual(PORT_NAME)
        .ok()?;
    Some(Port {
        name: PORT_NAME.to_string(),
        connection,
    })
}

/// Windows cannot create a virtual port without a driver: a loopback port made by another
/// program (loopMIDI, or the loopback of Windows MIDI Services) stands in for it.
#[cfg(not(unix))]
fn open_default() -> Option<Port> {
    open(crate::midi::find_loopback)
}
