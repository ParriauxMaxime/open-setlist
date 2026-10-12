//! A gig is long and Wi-Fi is rough: the program must go on answering after the system
//! refused it a connection. Here it is started with very few file descriptors and sent more
//! connections than it can take, which makes accepting fail the way a tablet dropping off
//! the network at the wrong moment can.
#![cfg(unix)]

mod common;

use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const DESCRIPTORS: usize = 48;

struct Program(Child);

impl Drop for Program {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn answers_within(port: u16, patience: Duration) -> bool {
    let deadline = Instant::now() + patience;
    while Instant::now() < deadline {
        if common::request(port, "GET", "/status", "").is_some_and(|answer| answer.status == 200) {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
    }
    false
}

#[test]
fn goes_on_answering_after_running_out_of_connections() {
    let port = {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        listener.local_addr().unwrap().port()
    };
    let _program = Program(
        Command::new("sh")
            .arg("-c")
            .arg(format!(
                "ulimit -n {DESCRIPTORS} && exec \"$0\" --no-bluetooth --no-open --port {port}"
            ))
            .arg(env!("CARGO_BIN_EXE_open-setlist-companion"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap(),
    );
    assert!(answers_within(port, Duration::from_secs(10)), "no start");

    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let held: Vec<TcpStream> = (0..3 * DESCRIPTORS)
        .filter_map(|_| TcpStream::connect_timeout(&address, Duration::from_secs(1)).ok())
        .collect();
    assert!(held.len() > DESCRIPTORS, "only {} connections", held.len());
    thread::sleep(Duration::from_secs(1));
    drop(held);

    assert!(answers_within(port, Duration::from_secs(10)));
}
