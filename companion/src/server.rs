//! The Wi-Fi side: what the tablets and the status page ask over HTTP.

use std::io;
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use rustls::ServerConfig;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::http::{self, Incoming, Reply, Request};
use crate::hub::{Hub, Sender, Via};
use crate::midi::{Message, NoOutput, is_channel_voice};
use crate::tls::Connection;
use crate::{net, page, unix_ms};

pub const APP: &str = "open-setlist-companion";
pub const DEFAULT_PORT: u16 = 7777;

const MAX_BODY: usize = 16 * 1024;
const MAX_MESSAGES: usize = 32;
const MAX_LABEL: usize = 40;
const DEFAULT_WAIT: u64 = 25;
const MAX_WAIT: u64 = 30;
const ACCEPT_AGAIN: Duration = Duration::from_millis(50);
/// How often silent tablets are looked for, at most.
const LOOK_FOR_SILENCE: Duration = Duration::from_secs(1);

/// The app is a web page from another origin, served over HTTPS, calling a private address.
const HEADERS: [(&str, &str); 6] = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
    ("Access-Control-Allow-Headers", "Content-Type"),
    ("Access-Control-Allow-Private-Network", "true"),
    ("Access-Control-Max-Age", "86400"),
    ("Cache-Control", "no-store"),
];

pub struct Settings {
    /// Name of this computer, as its owner knows it.
    pub name: String,
    /// `<host>.local`, when the system answers to it.
    pub local_name: Option<String>,
    pub port: u16,
    pub app_url: String,
}

#[derive(Deserialize)]
struct Play {
    messages: Vec<Message>,
    #[serde(default)]
    from: Option<String>,
    /// The id the tablet also reports on `/presence`.
    #[serde(default)]
    device: Option<String>,
}

fn reply(status: u16, content_type: Option<&'static str>, body: Vec<u8>) -> Reply {
    let content_type = content_type.map(|value| ("Content-Type", value));
    Reply {
        status,
        headers: HEADERS.into_iter().chain(content_type).collect(),
        body,
    }
}

fn empty() -> Reply {
    reply(204, None, Vec::new())
}

fn json_reply(status: u16, body: Value) -> Reply {
    reply(
        status,
        Some("application/json"),
        body.to_string().into_bytes(),
    )
}

fn error(status: u16, code: &str) -> Reply {
    json_reply(status, json!({ "error": code }))
}

fn bad_request() -> Reply {
    error(400, "bad-request")
}

/// Starts answering on `listener`, on threads of its own. With `tls`, the same port also
/// takes HTTPS: each connection is read for what it speaks.
pub fn start(
    listener: TcpListener,
    hub: Arc<Hub>,
    settings: Settings,
    tls: Option<Arc<ServerConfig>>,
) -> io::Result<()> {
    let settings = Arc::new(settings);
    let watched = hub.clone();
    let tick = (watched.presence.silence() / 5).min(LOOK_FOR_SILENCE);
    thread::Builder::new()
        .name("presence".to_string())
        .spawn(move || {
            loop {
                thread::sleep(tick);
                watched.presence.forget_silent();
            }
        })?;
    thread::Builder::new()
        .name("http".to_string())
        .spawn(move || {
            for connection in listener.incoming() {
                let Ok(stream) = connection else {
                    // A tablet that left before it was let in, or no room for one more
                    // connection: neither is a reason to stop listening.
                    thread::sleep(ACCEPT_AGAIN);
                    continue;
                };
                let (hub, settings, tls) = (hub.clone(), settings.clone(), tls.clone());
                // A thread for each connection: a tablet that waits for a position, or one
                // that stalls, holds up neither the others nor `/midi`. If the thread
                // cannot start, the connection is closed and the tablet asks again.
                let _ = thread::Builder::new()
                    .name("request".to_string())
                    .spawn(move || {
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
                        if let Some(stream) = Connection::accept(stream, tls.as_ref()) {
                            converse(stream, &hub, &settings);
                        }
                    });
            }
        })?;
    Ok(())
}

fn converse(mut stream: Connection, hub: &Hub, settings: &Settings) {
    let (reply, with_body) = match http::read(&mut stream, MAX_BODY) {
        Incoming::Request(request) => (route(&request, hub, settings), request.method != "HEAD"),
        Incoming::Malformed => (bad_request(), true),
        Incoming::Gone => return,
    };
    // A tablet that went away does not want the answer.
    let _ = http::write(&mut stream, &reply, with_body);
}

fn route(request: &Request, hub: &Hub, settings: &Settings) -> Reply {
    match (request.method.as_str(), request.path.as_str()) {
        ("OPTIONS", _) => empty(),
        ("GET", "/") => reply(
            200,
            Some("text/html; charset=utf-8"),
            page::render(settings, &net::addresses()).into_bytes(),
        ),
        ("GET", "/status") => json_reply(200, status(hub, settings)),
        ("POST", "/midi") => play(request, hub),
        ("POST", "/position") => publish(request, hub),
        ("GET", "/position") => next_position(&request.query, hub),
        ("GET", "/feedback") => next_feedback(&request.query, hub),
        ("POST", "/presence") => report(request, hub),
        ("GET", "/devices") => next_devices(&request.query, hub),
        ("GET", "/log") => next_log(&request.query, hub),
        _ => error(404, "not-found"),
    }
}

fn status(hub: &Hub, settings: &Settings) -> Value {
    json!({
        "app": APP,
        "version": env!("CARGO_PKG_VERSION"),
        "name": settings.name,
        "uptime": hub.uptime().as_secs(),
        "midiOut": hub.midi_out(),
        "midiIn": hub.midi_in(),
        "bluetooth": hub.bluetooth(),
        "sent": hub.sent(),
        "recent": hub.recent(),
        "feedback": feedback(hub.feedback.current()),
    })
}

/// The body is read as JSON whatever its Content-Type: the app sends it as text/plain to
/// avoid a preflight.
fn play(request: &Request, hub: &Hub) -> Reply {
    let Ok(play) = serde_json::from_slice::<Play>(&request.body) else {
        return bad_request();
    };
    let valid = play.messages.len() <= MAX_MESSAGES
        && play
            .messages
            .iter()
            .all(|message| is_channel_voice(message));
    if !valid {
        return bad_request();
    }
    let sender = Sender {
        from: label(play.from.as_deref(), request),
        device: play
            .device
            .filter(|device| !device.is_empty())
            .map(|device| device.chars().take(MAX_LABEL).collect()),
        via: Via::Wifi,
    };
    match hub.play(play.messages, sender) {
        Ok(sent) => json_reply(200, json!({ "sent": sent })),
        Err(NoOutput) => error(503, "no-midi-output"),
    }
}

/// The label shown on the status page: the one the tablet gave, else its address.
fn label(from: Option<&str>, request: &Request) -> String {
    match from.map(str::trim).filter(|from| !from.is_empty()) {
        Some(from) => from.chars().take(MAX_LABEL).collect(),
        None => request
            .from
            .map(|address| address.to_string())
            .unwrap_or_default(),
    }
}

fn publish(request: &Request, hub: &Hub) -> Reply {
    match serde_json::from_slice::<Value>(&request.body) {
        Ok(position) if is_position(&position) => {
            json_reply(200, json!({ "seq": hub.positions.set(position) }))
        }
        _ => bad_request(),
    }
}

/// A position is relayed as it came, so that the app can add to it without a new companion.
fn is_position(value: &Value) -> bool {
    ["from", "setlistId", "songId"]
        .iter()
        .all(|key| value[key].is_string())
        && value["index"].is_u64()
}

/// `after` and `wait` from the query string of a request that waits.
fn poll(query: &str) -> Option<(u64, Duration)> {
    let mut after = 0;
    let mut wait = DEFAULT_WAIT;
    for pair in query.split('&') {
        match pair.split_once('=') {
            Some(("after", value)) => after = value.parse().ok()?,
            Some(("wait", value)) => wait = value.parse().ok()?,
            _ => {}
        }
    }
    Some((after, Duration::from_secs(wait.min(MAX_WAIT))))
}

/// Holds the request until there is a position newer than the one the tablet has.
fn next_position(query: &str, hub: &Hub) -> Reply {
    let Some((after, wait)) = poll(query) else {
        return bad_request();
    };
    match hub.positions.next(after, wait) {
        Some((seq, position)) => json_reply(200, json!({ "seq": seq, "position": position })),
        None => empty(),
    }
}

fn feedback((seq, state): (u64, Vec<Message>)) -> Value {
    json!({ "seq": seq, "state": state })
}

/// Holds the request until the gear has sent something newer than what the tablet saw.
fn next_feedback(query: &str, hub: &Hub) -> Reply {
    let Some((after, wait)) = poll(query) else {
        return bad_request();
    };
    match hub.feedback.next(after, wait) {
        Some(current) => json_reply(200, feedback(current)),
        None => empty(),
    }
}

fn report(request: &Request, hub: &Hub) -> Reply {
    let seq = serde_json::from_slice::<Value>(&request.body)
        .ok()
        .and_then(|report| hub.presence.report(report, request.from));
    match seq {
        Some(seq) => json_reply(200, json!({ "seq": seq })),
        None => bad_request(),
    }
}

/// Holds the request until a tablet came, went or reported again.
fn next_devices(query: &str, hub: &Hub) -> Reply {
    let Some((after, wait)) = poll(query) else {
        return bad_request();
    };
    match hub.presence.next(after, wait) {
        Some((seq, devices)) => json_reply(
            200,
            json!({ "seq": seq, "now": unix_ms(), "devices": devices }),
        ),
        None => empty(),
    }
}

/// Holds the request until a batch newer than what the page has was played.
fn next_log(query: &str, hub: &Hub) -> Reply {
    let Some((after, wait)) = poll(query) else {
        return bad_request();
    };
    match hub.next_log(after, wait) {
        Some((seq, entries)) => json_reply(
            200,
            json!({ "seq": seq, "now": unix_ms(), "entries": entries }),
        ),
        None => empty(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_after_and_wait_from_the_query() {
        assert_eq!(poll(""), Some((0, Duration::from_secs(25))));
        assert_eq!(poll("after=3"), Some((3, Duration::from_secs(25))));
        assert_eq!(poll("after=3&wait=0"), Some((3, Duration::ZERO)));
        assert_eq!(
            poll("wait=10&after=12"),
            Some((12, Duration::from_secs(10)))
        );
        assert_eq!(poll("after=1&other=x"), Some((1, Duration::from_secs(25))));
    }

    #[test]
    fn caps_the_wait_at_thirty_seconds() {
        assert_eq!(poll("wait=300"), Some((0, Duration::from_secs(30))));
    }

    #[test]
    fn refuses_a_query_that_is_not_made_of_whole_numbers() {
        assert_eq!(poll("after=abc"), None);
        assert_eq!(poll("after=-1"), None);
        assert_eq!(poll("wait=2.5"), None);
        assert_eq!(poll("wait="), None);
    }

    #[test]
    fn a_position_names_a_device_a_setlist_a_song_and_an_index() {
        let position = json!({"from": "a", "setlistId": "s", "songId": "x", "index": 3});
        assert!(is_position(&position));
        assert!(is_position(
            &json!({"from": "a", "setlistId": "s", "songId": "x", "index": 0, "more": true})
        ));
        assert!(!is_position(
            &json!({"from": "a", "setlistId": "s", "index": 3})
        ));
        assert!(!is_position(
            &json!({"from": "a", "setlistId": "s", "songId": "x", "index": -1})
        ));
        assert!(!is_position(
            &json!({"from": "a", "setlistId": "s", "songId": "x", "index": "3"})
        ));
        assert!(!is_position(&json!([1, 2, 3])));
        assert!(!is_position(&json!("position")));
    }
}
