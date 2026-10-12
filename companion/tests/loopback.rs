//! The real thing, on a computer with a MIDI system: starts the program, listens to its
//! "Open Setlist" port the way Ableton would, and checks that what is posted over HTTP
//! comes out as MIDI. Not run by default, because build machines have no MIDI system:
//!
//!     cargo test --test loopback -- --ignored
#![cfg(unix)]

mod common;

use std::net::{Ipv4Addr, TcpListener};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Sender};
use std::thread;
use std::time::{Duration, Instant};

use midir::{MidiInput, MidiInputConnection};
use open_setlist_companion::midi::{Message, PORT_NAME};
use serde_json::json;

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

    let arrived: Vec<Message> = (0..3)
        .map(|_| {
            received
                .recv_timeout(Duration::from_secs(3))
                .expect("a MIDI message")
        })
        .collect();
    assert_eq!(json!(arrived), messages);
    assert!(received.recv_timeout(Duration::from_millis(200)).is_err());
}
