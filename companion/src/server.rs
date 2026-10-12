//! The Wi-Fi side: what the tablets and the status page ask over HTTP.

use std::io::{self, Read};
use std::net::TcpListener;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::hub::{Hub, Via};
use crate::midi::{Message, NoOutput, is_channel_voice};
use crate::{net, page};

pub const APP: &str = "open-setlist-companion";
pub const DEFAULT_PORT: u16 = 7777;

const MAX_BODY: usize = 16 * 1024;
const MAX_MESSAGES: usize = 32;
const MAX_LABEL: usize = 40;
const DEFAULT_WAIT: u64 = 25;
const MAX_WAIT: u64 = 30;
const LISTEN_AGAIN: Duration = Duration::from_millis(250);

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

struct Reply {
    status: u16,
    content_type: Option<&'static str>,
    body: Vec<u8>,
}

impl Reply {
    fn empty() -> Self {
        Self {
            status: 204,
            content_type: None,
            body: Vec::new(),
        }
    }

    fn json(status: u16, body: Value) -> Self {
        Self {
            status,
            content_type: Some("application/json"),
            body: body.to_string().into_bytes(),
        }
    }

    fn html(body: String) -> Self {
        Self {
            status: 200,
            content_type: Some("text/html; charset=utf-8"),
            body: body.into_bytes(),
        }
    }

    fn error(status: u16, code: &str) -> Self {
        Self::json(status, json!({ "error": code }))
    }

    fn bad_request() -> Self {
        Self::error(400, "bad-request")
    }
}

#[derive(Deserialize)]
struct Play {
    messages: Vec<Message>,
    #[serde(default)]
    from: Option<String>,
}

/// Starts answering on `listener`, on threads of its own.
pub fn start(listener: TcpListener, hub: Arc<Hub>, settings: Settings) -> io::Result<()> {
    let settings = Arc::new(settings);
    let mut first = Some(serve(&listener)?);
    thread::Builder::new()
        .name("http".to_string())
        .spawn(move || {
            loop {
                if let Some(server) = first.take().or_else(|| serve(&listener).ok()) {
                    answer(&server, &hub, &settings);
                }
                // tiny_http stops for good when accepting one connection fails, which a
                // tablet dropping off the Wi-Fi at the wrong moment is enough to cause.
                // The socket is still ours: listen on it again.
                thread::sleep(LISTEN_AGAIN);
            }
        })?;
    Ok(())
}

fn serve(listener: &TcpListener) -> io::Result<Server> {
    Server::from_listener(listener.try_clone()?, None).map_err(io::Error::other)
}

/// Gives every request a thread of its own, so that a tablet waiting for a position, or
/// one whose connection stalls, holds up neither the others nor `/midi`.
fn answer(server: &Server, hub: &Arc<Hub>, settings: &Arc<Settings>) {
    for request in server.incoming_requests() {
        let (hub, settings) = (hub.clone(), settings.clone());
        // If the thread cannot start, the request is dropped and tiny_http answers 500.
        let _ = thread::Builder::new()
            .name("request".to_string())
            .spawn(move || handle(request, &hub, &settings));
    }
}

fn handle(mut request: Request, hub: &Hub, settings: &Settings) {
    let (path, query) = match request.url().split_once('?') {
        Some((path, query)) => (path.to_string(), query.to_string()),
        None => (request.url().to_string(), String::new()),
    };
    let reply = match (request.method(), path.as_str()) {
        (Method::Options, _) => Reply::empty(),
        (Method::Get, "/") => Reply::html(page::render(settings, &net::addresses())),
        (Method::Get, "/status") => Reply::json(200, status(hub, settings)),
        (Method::Post, "/midi") => play(&mut request, hub),
        (Method::Post, "/position") => publish(&mut request, hub),
        (Method::Get, "/position") => next_position(&query, hub),
        _ => Reply::error(404, "not-found"),
    };
    respond(request, reply);
}

fn respond(request: Request, reply: Reply) {
    let mut response = Response::from_data(reply.body).with_status_code(reply.status);
    let content_type = reply.content_type.map(|value| ("Content-Type", value));
    for (name, value) in HEADERS.into_iter().chain(content_type) {
        if let Ok(header) = Header::from_bytes(name, value) {
            response.add_header(header);
        }
    }
    // A tablet that went away does not want the answer.
    let _ = request.respond(response);
}

fn status(hub: &Hub, settings: &Settings) -> Value {
    json!({
        "app": APP,
        "version": env!("CARGO_PKG_VERSION"),
        "name": settings.name,
        "midiOut": hub.midi_out(),
        "bluetooth": hub.bluetooth(),
        "sent": hub.sent(),
        "recent": hub.recent(),
    })
}

/// The body, whatever its Content-Type: the app sends JSON as text/plain to avoid a preflight.
fn body(request: &mut Request) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    request
        .as_reader()
        .take(MAX_BODY as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    (bytes.len() <= MAX_BODY).then_some(bytes)
}

fn play(request: &mut Request, hub: &Hub) -> Reply {
    let Some(play) = body(request).and_then(|body| serde_json::from_slice::<Play>(&body).ok())
    else {
        return Reply::bad_request();
    };
    let valid = play.messages.len() <= MAX_MESSAGES
        && play
            .messages
            .iter()
            .all(|message| is_channel_voice(message));
    if !valid {
        return Reply::bad_request();
    }
    let from = label(play.from.as_deref(), request);
    match hub.play(play.messages, from, Via::Wifi) {
        Ok(sent) => Reply::json(200, json!({ "sent": sent })),
        Err(NoOutput) => Reply::error(503, "no-midi-output"),
    }
}

/// The label shown on the status page: the one the tablet gave, else its address.
fn label(from: Option<&str>, request: &Request) -> String {
    match from.map(str::trim).filter(|from| !from.is_empty()) {
        Some(from) => from.chars().take(MAX_LABEL).collect(),
        None => request
            .remote_addr()
            .map(|address| address.ip().to_string())
            .unwrap_or_default(),
    }
}

fn publish(request: &mut Request, hub: &Hub) -> Reply {
    let position = body(request)
        .and_then(|body| serde_json::from_slice::<Value>(&body).ok())
        .filter(is_position);
    match position {
        Some(position) => Reply::json(200, json!({ "seq": hub.positions.publish(position) })),
        None => Reply::bad_request(),
    }
}

/// A position is relayed as it came, so that the app can add to it without a new companion.
fn is_position(value: &Value) -> bool {
    ["from", "setlistId", "songId"]
        .iter()
        .all(|key| value[key].is_string())
        && value["index"].is_u64()
}

/// `after` and `wait` from the query string of `GET /position`.
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
        return Reply::bad_request();
    };
    match hub.positions.next(after, wait) {
        Some((seq, position)) => Reply::json(200, json!({ "seq": seq, "position": position })),
        None => Reply::empty(),
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
