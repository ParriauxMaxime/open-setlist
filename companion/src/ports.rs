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

struct Copy {
    wanted: String,
    port: Option<Port>,
}

pub struct Ports {
    wanted: Option<String>,
    main: Mutex<Option<Port>>,
    copies: Mutex<Vec<Copy>>,
}

impl Ports {
    /// `wanted` names an existing output to use instead of the default one; every message
    /// is also sent to the outputs named in `copies`.
    pub fn new(wanted: Option<String>, copies: Vec<String>) -> Self {
        let copies = copies
            .into_iter()
            .map(|wanted| Copy { wanted, port: None })
            .collect();
        Self {
            wanted,
            main: Mutex::new(None),
            copies: Mutex::new(copies),
        }
    }

    /// Opens what is not open yet. A port can show up late (loopMIDI started afterwards, a
    /// pedalboard plugged in) or go away, so this is called again every few seconds.
    pub fn refresh(&self) {
        let mut main = lock(&self.main);
        if main.is_none() {
            *main = match &self.wanted {
                Some(wanted) => open(|names| find_port(names, wanted)),
                None => open_default(),
            };
        }
        let in_use = main.as_ref().map(|port| port.name.clone());
        drop(main);
        for copy in lock(&self.copies).iter_mut() {
            if copy.port.is_none() {
                copy.port = open(|names| find_port(names, &copy.wanted))
                    .filter(|port| Some(&port.name) != in_use.as_ref());
            }
        }
    }

    /// What was asked for with `--also`, and the output found for it.
    pub fn copies(&self) -> Vec<(String, Option<String>)> {
        lock(&self.copies)
            .iter()
            .map(|copy| {
                let found = copy.port.as_ref().map(|port| port.name.clone());
                (copy.wanted.clone(), found)
            })
            .collect()
    }
}

impl MidiOut for Ports {
    fn name(&self) -> Option<String> {
        lock(&self.main).as_ref().map(|port| port.name.clone())
    }

    fn send(&self, messages: &[Message]) -> Result<(), NoOutput> {
        let mut main = lock(&self.main);
        let sent = main.as_mut().is_some_and(|port| port.send(messages));
        if !sent {
            // Closed, so that the next refresh looks for it again.
            *main = None;
            return Err(NoOutput);
        }
        drop(main);
        for copy in lock(&self.copies).iter_mut() {
            if copy.port.as_mut().is_some_and(|port| !port.send(messages)) {
                copy.port = None;
            }
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
