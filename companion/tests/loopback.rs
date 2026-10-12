//! The real thing, on a computer with a MIDI system: starts the program, listens to its
//! "Open Setlist" port the way Ableton would, and checks that what is posted over HTTP
//! comes out as MIDI. Not run by default, because build machines have no MIDI system:
//!
//!     cargo test --test loopback -- --ignored
#![cfg(unix)]

mod common;

use std::net::{Ipv4Addr, TcpListener};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use midir::os::unix::VirtualInput;
use midir::{MidiInput, MidiInputConnection};
use open_setlist_companion::midi::{Message, MidiOut, NoOutput, PORT_NAME};
use open_setlist_companion::ports::Ports;
use serde_json::json;

type Listener = MidiInputConnection<Sender<Message>>;

/// The tests share one MIDI system, where ports are told apart by name only.
static MIDI_SYSTEM: Mutex<()> = Mutex::new(());

fn alone() -> MutexGuard<'static, ()> {
    MIDI_SYSTEM
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// A MIDI destination of our own, standing in for a drum pad or a pedalboard on a cable.
fn hardware(name: &str) -> (Listener, Receiver<Message>) {
    let (sender, received) = mpsc::channel();
    let listener = MidiInput::new(name)
        .unwrap()
        .create_virtual(
            name,
            |_, message, received| {
                let _ = received.send(message.to_vec());
            },
            sender,
        )
        .unwrap();
    (listener, received)
}

fn next(received: &Receiver<Message>) -> Message {
    received
        .recv_timeout(Duration::from_secs(3))
        .expect("a MIDI message")
}

struct Program(Child);

impl Drop for Program {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn free_port() -> u16 {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    listener.local_addr().unwrap().port()
}

/// Listens to every input named like the companion's port: another companion may be running.
fn listen(received: Sender<Message>) -> Vec<MidiInputConnection<Sender<Message>>> {
    let midi = MidiInput::new("loopback test").unwrap();
    midi.ports()
        .iter()
        .filter(|port| {
            midi.port_name(port)
                .is_ok_and(|name| name.contains(PORT_NAME))
        })
        .map(|port| {
            MidiInput::new("loopback test")
                .unwrap()
                .connect(
                    port,
                    "loopback test",
                    |_, message, received| {
                        let _ = received.send(message.to_vec());
                    },
                    received.clone(),
                )
                .unwrap()
        })
        .collect()
}

#[test]
#[ignore = "needs the MIDI system of a real computer"]
fn midi_posted_over_http_comes_out_of_the_virtual_port() {
    let _alone = alone();
    let port = free_port();
    let _program = Program(
        Command::new(env!("CARGO_BIN_EXE_open-setlist-companion"))
            .args(["--no-bluetooth", "--no-open", "--port", &port.to_string()])
            .stdout(Stdio::null())
            .spawn()
            .unwrap(),
    );
    let deadline = Instant::now() + Duration::from_secs(10);
    let status = loop {
        if let Some(answer) = common::request(port, "GET", "/status", "") {
            break answer.json();
        }
        assert!(Instant::now() < deadline, "the program did not start");
        thread::sleep(Duration::from_millis(50));
    };
    assert_eq!(status["midiOut"], PORT_NAME);

    let (sender, received) = mpsc::channel();
    let inputs = listen(sender);
    assert!(!inputs.is_empty(), "no MIDI input named {PORT_NAME}");

    let messages = json!([[176, 21, 0], [176, 20, 6], [201, 5]]);
    let body = json!({"messages": messages, "from": "loopback test"}).to_string();
    let answer = common::request(port, "POST", "/midi", &body).unwrap();
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json(), json!({"sent": 3}));

    let arrived: Vec<Message> = (0..3).map(|_| next(&received)).collect();
    assert_eq!(json!(arrived), messages);
    assert!(received.recv_timeout(Duration::from_millis(200)).is_err());
}

#[test]
#[ignore = "needs the MIDI system of a real computer"]
fn out_sends_to_an_existing_output_found_by_part_of_its_name() {
    let _alone = alone();
    let (_pedalboard, received) = hardware("Loopback Test Pedalboard");
    let ports = Ports::new(Some("test pedal".to_string()), Vec::new());
    ports.refresh();
    let name = ports.name().expect("an output");
    assert!(name.contains("Loopback Test Pedalboard"), "{name}");
    assert_eq!(ports.send(&[vec![0xC0, 7]]), Ok(()));
    assert_eq!(next(&received), vec![0xC0, 7]);
}

#[test]
#[ignore = "needs the MIDI system of a real computer"]
fn also_copies_every_message_to_another_output() {
    let _alone = alone();
    let (_pad, received) = hardware("Loopback Test Pad");
    let wanted = vec!["test pad".to_string(), "no such thing".to_string()];
    let ports = Ports::new(None, wanted);
    ports.refresh();
    assert_eq!(ports.name().as_deref(), Some(PORT_NAME));
    let copies = ports.copies();
    assert!(
        copies[0]
            .1
            .as_ref()
            .is_some_and(|name| name.contains("Loopback Test Pad"))
    );
    assert_eq!(copies[1], ("no such thing".to_string(), None));
    assert_eq!(ports.send(&[vec![0xC9, 3], vec![0xB0, 20, 6]]), Ok(()));
    assert_eq!(next(&received), vec![0xC9, 3]);
    assert_eq!(next(&received), vec![0xB0, 20, 6]);
}

#[test]
#[ignore = "needs the MIDI system of a real computer"]
fn an_output_that_shows_up_late_is_found_at_the_next_look() {
    let _alone = alone();
    let ports = Ports::new(Some("late pedal".to_string()), Vec::new());
    ports.refresh();
    assert_eq!(ports.name(), None);
    assert_eq!(ports.send(&[vec![0xC0, 1]]), Err(NoOutput));

    let (_pedalboard, received) = hardware("Loopback Late Pedalboard");
    ports.refresh();
    assert!(ports.name().is_some());
    assert_eq!(ports.send(&[vec![0xC0, 2]]), Ok(()));
    assert_eq!(next(&received), vec![0xC0, 2]);
}
