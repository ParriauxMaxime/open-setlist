//! Just enough HTTP/1.1 for the tablets and the status page: one request per connection,
//! read whole within a deadline, then one answer. A tablet that falls off the Wi-Fi halfway
//! keeps nothing open, and nothing here can stop the program from listening.

use std::io::{self, Read, Write};
use std::net::{IpAddr, TcpStream};
use std::time::{Duration, Instant};

/// How long a request may take to arrive whole, and its answer to leave.
const PATIENCE: Duration = Duration::from_secs(10);
const MAX_HEAD: usize = 8 * 1024;
const MAX_HEADERS: usize = 64;
/// What is read and thrown away of a body that is too long, so that the refusal reaches a
/// client still busy sending.
const MAX_DISCARDED: usize = 1024 * 1024;

pub struct Request {
    pub method: String,
    pub path: String,
    pub query: String,
    pub body: Vec<u8>,
    pub from: Option<IpAddr>,
}

pub struct Reply {
    pub status: u16,
    pub headers: Vec<(&'static str, &'static str)>,
    pub body: Vec<u8>,
}

pub enum Incoming {
    Request(Request),
    /// Not HTTP, or more than is accepted.
    Malformed,
    /// Closed, or silent for too long, before a whole request arrived.
    Gone,
}

struct Head {
    method: String,
    target: String,
    body_at: usize,
    body_len: usize,
    expects_continue: bool,
}

fn parse_head(received: &[u8]) -> Result<Option<Head>, ()> {
    let mut headers = [httparse::EMPTY_HEADER; MAX_HEADERS];
    let mut request = httparse::Request::new(&mut headers);
    let httparse::Status::Complete(body_at) = request.parse(received).map_err(drop)? else {
        return Ok(None);
    };
    let header = |name: &str| {
        request
            .headers
            .iter()
            .find(|header| header.name.eq_ignore_ascii_case(name))
            .map(|header| header.value)
    };
    // The app sends its bodies whole, with their length.
    if header("Transfer-Encoding").is_some() {
        return Err(());
    }
    let body_len = match header("Content-Length") {
        Some(value) => std::str::from_utf8(value)
            .ok()
            .and_then(|value| value.trim().parse().ok())
            .ok_or(())?,
        None => 0,
    };
    Ok(Some(Head {
        method: request.method.unwrap_or_default().to_string(),
        target: request.path.unwrap_or_default().to_string(),
        body_at,
        body_len,
        expects_continue: header("Expect")
            .is_some_and(|value| value.eq_ignore_ascii_case(b"100-continue")),
    }))
}

/// Reads more of the request, unless the connection closed or the deadline passed.
fn read_more(stream: &mut TcpStream, into: &mut Vec<u8>, deadline: Instant) -> bool {
    let left = deadline.saturating_duration_since(Instant::now());
    let mut chunk = [0; 4096];
    if left.is_zero() || stream.set_read_timeout(Some(left)).is_err() {
        return false;
    }
    match stream.read(&mut chunk) {
        Ok(count) if count > 0 => {
            into.extend_from_slice(&chunk[..count]);
            true
        }
        _ => false,
    }
}

/// Reads the one request of a connection, with a body of `max_body` bytes at most.
pub fn read(stream: &mut TcpStream, max_body: usize) -> Incoming {
    let deadline = Instant::now() + PATIENCE;
    let mut received = Vec::new();
    let head = loop {
        match parse_head(&received) {
            Ok(Some(head)) => break head,
            Ok(None) if received.len() <= MAX_HEAD => {}
            _ => return Incoming::Malformed,
        }
        if !read_more(stream, &mut received, deadline) {
            return Incoming::Gone;
        }
    };
    let mut body = received.split_off(head.body_at);
    if head.body_len > max_body {
        let mut unread = head.body_len.saturating_sub(body.len()).min(MAX_DISCARDED);
        body.clear();
        while unread > 0 && read_more(stream, &mut body, deadline) {
            unread = unread.saturating_sub(body.len());
            body.clear();
        }
        return Incoming::Malformed;
    }
    if head.expects_continue && body.len() < head.body_len {
        let _ = stream.write_all(b"HTTP/1.1 100 Continue\r\n\r\n");
    }
    while body.len() < head.body_len {
        if !read_more(stream, &mut body, deadline) {
            return Incoming::Gone;
        }
    }
    body.truncate(head.body_len);
    let (path, query) = head.target.split_once('?').unwrap_or((&head.target, ""));
    Incoming::Request(Request {
        method: head.method,
        path: path.to_string(),
        query: query.to_string(),
        body,
        from: stream.peer_addr().ok().map(|address| address.ip()),
    })
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        503 => "Service Unavailable",
        _ => "",
    }
}

/// Sends the answer; the connection closes after it. `with_body` is false for HEAD.
pub fn write(stream: &mut TcpStream, reply: &Reply, with_body: bool) -> io::Result<()> {
    let mut message = format!("HTTP/1.1 {} {}\r\n", reply.status, reason(reply.status));
    for (name, value) in &reply.headers {
        message += &format!("{name}: {value}\r\n");
    }
    // An answer without content has no length either.
    if reply.status != 204 {
        message += &format!("Content-Length: {}\r\n", reply.body.len());
    }
    message += "Connection: close\r\n\r\n";
    let mut message = message.into_bytes();
    if with_body {
        message.extend_from_slice(&reply.body);
    }
    stream.set_write_timeout(Some(PATIENCE))?;
    stream.write_all(&message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waits_for_the_whole_head() {
        assert!(matches!(parse_head(b""), Ok(None)));
        assert!(matches!(
            parse_head(b"POST /midi HTTP/1.1\r\nHost: x\r\n"),
            Ok(None)
        ));
    }

    #[test]
    fn reads_the_method_the_target_and_the_length_of_the_body() {
        let request = b"POST /midi?x=1 HTTP/1.1\r\nHost: x\r\ncontent-length: 12\r\n\r\n{\"messa";
        let head = parse_head(request).unwrap().unwrap();
        assert_eq!(head.method, "POST");
        assert_eq!(head.target, "/midi?x=1");
        assert_eq!(head.body_len, 12);
        assert_eq!(&request[head.body_at..], b"{\"messa");
        assert!(!head.expects_continue);
    }

    #[test]
    fn a_request_without_a_length_has_no_body() {
        let head = parse_head(b"GET /status HTTP/1.1\r\nHost: x\r\n\r\n")
            .unwrap()
            .unwrap();
        assert_eq!(head.body_len, 0);
    }

    #[test]
    fn notices_a_client_that_waits_for_a_go_ahead() {
        let request =
            b"POST /midi HTTP/1.1\r\nContent-Length: 2000\r\nExpect: 100-continue\r\n\r\n";
        assert!(parse_head(request).unwrap().unwrap().expects_continue);
    }

    #[test]
    fn refuses_what_is_not_http_or_not_sent_whole() {
        assert!(parse_head(b"hello\r\n\r\n").is_err());
        assert!(parse_head(b"POST /midi HTTP/1.1\r\nContent-Length: many\r\n\r\n").is_err());
        assert!(parse_head(b"POST /midi HTTP/1.1\r\nContent-Length: -1\r\n\r\n").is_err());
        assert!(parse_head(b"POST /midi HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n").is_err());
    }
}
