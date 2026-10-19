//! A bare HTTP client, so that the tests see exactly what goes over the wire.
// Each test file uses a part of it.
#![allow(dead_code)]

use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpStream};
use std::thread;
use std::time::Duration;

use serde_json::Value;

pub struct Answer {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

impl Answer {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header, _)| header == name)
            .map(|(_, value)| value.as_str())
    }

    pub fn json(&self) -> Value {
        serde_json::from_str(&self.body).expect("a JSON body")
    }
}

pub fn connect(port: u16) -> Option<TcpStream> {
    let stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).ok()?;
    stream
        .set_read_timeout(Some(Duration::from_secs(40)))
        .ok()?;
    Some(stream)
}

/// Everything the server sends until it closes the connection.
pub fn answer(stream: &mut TcpStream) -> Option<Answer> {
    let mut raw = String::new();
    stream.read_to_string(&mut raw).ok()?;
    parse(&raw)
}

pub fn parse(raw: &str) -> Option<Answer> {
    let (head, body) = raw.split_once("\r\n\r\n")?;
    let mut lines = head.lines();
    let status = lines.next()?.split(' ').nth(1)?.parse().ok()?;
    let headers = lines
        .filter_map(|line| line.split_once(": "))
        .map(|(name, value)| (name.to_lowercase(), value.to_string()))
        .collect();
    Some(Answer {
        status,
        headers,
        body: body.to_string(),
    })
}

/// Sends `pieces` one after the other, `pause` apart, and reads the answer. `None` when no
/// complete answer came back.
pub fn send(port: u16, pieces: &[&str], pause: Duration) -> Option<Answer> {
    let mut stream = connect(port)?;
    for piece in pieces {
        stream.write_all(piece.as_bytes()).ok()?;
        thread::sleep(pause);
    }
    answer(&mut stream)
}

/// One request the way the app sends it: from another origin, the body as text/plain.
pub fn request(port: u16, method: &str, path: &str, body: &str) -> Option<Answer> {
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: localhost\r\nOrigin: https://example.org\r\n\
         Content-Type: text/plain;charset=UTF-8\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    );
    send(port, &[&request], Duration::ZERO)
}
