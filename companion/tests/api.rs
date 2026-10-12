//! The protocol the web app is written against, over a real socket, with a MIDI output
//! that only remembers what it was sent.

mod common;

use std::net::{Ipv4Addr, TcpListener};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use open_setlist_companion::fake::FakeOut;
use open_setlist_companion::hub::{Bluetooth, Hub};
use open_setlist_companion::server::{self, Settings};
use serde_json::{Value, json};

use common::Answer;

const HEADERS: [(&str, &str); 6] = [
    ("access-control-allow-origin", "*"),
    ("access-control-allow-methods", "GET, POST, OPTIONS"),
    ("access-control-allow-headers", "Content-Type"),
    ("access-control-allow-private-network", "true"),
    ("access-control-max-age", "86400"),
    ("cache-control", "no-store"),
];

struct Companion {
    port: u16,
    out: Arc<FakeOut>,
    hub: Arc<Hub>,
}

impl Companion {
    fn start() -> Self {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let out = Arc::new(FakeOut::default());
        let hub = Arc::new(Hub::new(out.clone(), Bluetooth::Off));
        let settings = Settings {
            name: "Stage PC".to_string(),
            local_name: None,
            port,
            app_url: "https://example.org/settings".to_string(),
        };
        server::start(listener, hub.clone(), settings).unwrap();
        Self { port, out, hub }
    }

    fn request(&self, method: &str, path: &str, body: &str) -> Answer {
        common::request(self.port, method, path, body).expect("an answer")
    }

    fn get(&self, path: &str) -> Answer {
        self.request("GET", path, "")
    }

    fn post(&self, path: &str, body: &Value) -> Answer {
        self.request("POST", path, &body.to_string())
    }
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

fn position(index: u64) -> Value {
    json!({"from": "tablet-1", "setlistId": "gig", "songId": format!("song-{index}"), "index": index})
}

#[test]
fn status_describes_the_companion() {
    let companion = Companion::start();
    let answer = companion.get("/status");
    assert_eq!(answer.status, 200);
    assert_eq!(answer.header("content-type"), Some("application/json"));
    assert_eq!(
        answer.json(),
        json!({
            "app": "open-setlist-companion",
            "version": env!("CARGO_PKG_VERSION"),
            "name": "Stage PC",
            "midiOut": "Fake",
            "bluetooth": "off",
            "sent": 0,
            "recent": [],
        })
    );
}

#[test]
fn status_tells_the_bluetooth_state_in_three_words() {
    let companion = Companion::start();
    companion.hub.set_bluetooth(Bluetooth::Starting);
    assert_eq!(companion.get("/status").json()["bluetooth"], "unavailable");
    companion.hub.set_bluetooth(Bluetooth::Advertising);
    assert_eq!(companion.get("/status").json()["bluetooth"], "advertising");
    companion.hub.set_bluetooth(Bluetooth::Unavailable);
    assert_eq!(companion.get("/status").json()["bluetooth"], "unavailable");
}

#[test]
fn every_answer_can_be_read_by_a_page_from_another_origin() {
    let companion = Companion::start();
    let answers = [
        companion.get("/"),
        companion.get("/status"),
        companion.get("/position?wait=0"),
        companion.get("/position?after=x"),
        companion.get("/nowhere"),
        companion.post("/midi", &json!({"messages": [[176, 20, 6]]})),
        companion.post("/midi", &json!({"messages": [[240]]})),
        companion.post("/position", &position(0)),
        companion.request("OPTIONS", "/midi", ""),
    ];
    let statuses: Vec<u16> = answers.iter().map(|answer| answer.status).collect();
    assert_eq!(statuses, [200, 200, 204, 400, 404, 200, 400, 200, 204]);
    for answer in &answers {
        for (name, value) in HEADERS {
            assert_eq!(answer.header(name), Some(value), "{name}");
        }
    }
}

#[test]
fn options_answers_204_on_any_path() {
    let companion = Companion::start();
    for path in ["/", "/midi", "/position", "/status", "/anything/else"] {
        let answer = companion.request("OPTIONS", path, "");
        assert_eq!(answer.status, 204, "{path}");
        assert_eq!(answer.body, "");
    }
}

#[test]
fn midi_plays_a_batch_and_shows_it_in_the_status() {
    let companion = Companion::start();
    let before = unix_ms();
    let answer = companion.post(
        "/midi",
        &json!({"messages": [[176, 21, 0], [176, 20, 6]], "from": "Keys"}),
    );
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json(), json!({"sent": 2}));
    assert_eq!(
        companion.out.played(),
        vec![vec![176, 21, 0], vec![176, 20, 6]]
    );

    companion.post("/midi", &json!({"messages": [[193, 5]]}));
    let status = companion.get("/status").json();
    assert_eq!(status["sent"], 3);
    let recent = status["recent"].as_array().unwrap();
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0]["messages"], json!([[193, 5]]));
    assert_eq!(recent[0]["from"], "127.0.0.1");
    assert_eq!(recent[1]["messages"], json!([[176, 21, 0], [176, 20, 6]]));
    assert_eq!(recent[1]["from"], "Keys");
    assert_eq!(recent[1]["via"], "wifi");
    let at = recent[1]["at"].as_u64().unwrap();
    assert!((before..=unix_ms()).contains(&at));
}

#[test]
fn midi_accepts_thirty_two_messages_and_an_empty_batch() {
    let companion = Companion::start();
    let full: Vec<Value> = (0..32).map(|program| json!([192, program])).collect();
    assert_eq!(
        companion.post("/midi", &json!({"messages": full})).json(),
        json!({"sent": 32})
    );
    assert_eq!(
        companion.post("/midi", &json!({"messages": []})).json(),
        json!({"sent": 0})
    );
    let status = companion.get("/status").json();
    assert_eq!(status["recent"].as_array().unwrap().len(), 1);
    assert_eq!(status["sent"], 32);
    assert_eq!(companion.out.played().len(), 32);
}

#[test]
fn midi_shortens_a_long_label() {
    let companion = Companion::start();
    let from = "é".repeat(60);
    companion.post("/midi", &json!({"messages": [[192, 1]], "from": from}));
    let status = companion.get("/status").json();
    assert_eq!(status["recent"][0]["from"], "é".repeat(40));
}

#[test]
fn midi_refuses_what_is_not_a_batch_of_channel_voice_messages() {
    let companion = Companion::start();
    let too_many: Vec<Value> = (0..33).map(|program| json!([192, program])).collect();
    let refused = [
        "".to_string(),
        "not json".to_string(),
        "[[176, 20, 6]]".to_string(),
        json!({"from": "Keys"}).to_string(),
        json!({"messages": "176,20,6"}).to_string(),
        json!({"messages": [176, 20, 6]}).to_string(),
        json!({"messages": [[176, 20]]}).to_string(),
        json!({"messages": [[176, 20, 6, 1]]}).to_string(),
        json!({"messages": [[192, 5, 0]]}).to_string(),
        json!({"messages": [[176, 20, 128]]}).to_string(),
        json!({"messages": [[176, 20, 6.5]]}).to_string(),
        json!({"messages": [[176, 20, -1]]}).to_string(),
        json!({"messages": [[240, 1, 247]]}).to_string(),
        json!({"messages": [[248]]}).to_string(),
        json!({"messages": [[20, 6]]}).to_string(),
        json!({"messages": [[176, 20, 6]], "from": 7}).to_string(),
        json!({"messages": too_many}).to_string(),
        json!({"messages": [[176, 20, 6]], "from": "x".repeat(16 * 1024)}).to_string(),
    ];
    for body in refused {
        let answer = companion.request("POST", "/midi", &body);
        assert_eq!(answer.status, 400, "{body:.60}");
        assert_eq!(answer.json(), json!({"error": "bad-request"}));
    }
    assert!(companion.out.played().is_empty());
    assert_eq!(companion.get("/status").json()["sent"], 0);
}

#[test]
fn midi_answers_503_without_an_output() {
    let companion = Companion::start();
    companion.out.unplug();
    let answer = companion.post("/midi", &json!({"messages": [[176, 20, 6]]}));
    assert_eq!(answer.status, 503);
    assert_eq!(answer.json(), json!({"error": "no-midi-output"}));
    let status = companion.get("/status").json();
    assert_eq!(status["midiOut"], Value::Null);
    assert_eq!(status["sent"], 0);
}

#[test]
fn position_is_numbered_and_given_back_as_it_came() {
    let companion = Companion::start();
    assert_eq!(companion.get("/position?after=0&wait=0").status, 204);

    let first = companion.post("/position", &position(3));
    assert_eq!(first.status, 200);
    assert_eq!(first.json(), json!({"seq": 1}));
    let answer = companion.get("/position?after=0");
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json(), json!({"seq": 1, "position": position(3)}));
    assert_eq!(
        companion.get("/position").json(),
        json!({"seq": 1, "position": position(3)})
    );

    assert_eq!(
        companion.post("/position", &position(4)).json(),
        json!({"seq": 2})
    );
    assert_eq!(
        companion.get("/position?after=1").json(),
        json!({"seq": 2, "position": position(4)})
    );
    assert_eq!(companion.get("/position?after=2&wait=0").status, 204);
}

#[test]
fn position_refuses_what_is_not_a_position() {
    let companion = Companion::start();
    let refused = [
        "not json".to_string(),
        json!({"from": "tablet-1", "setlistId": "gig", "index": 3}).to_string(),
        json!({"from": "tablet-1", "setlistId": "gig", "songId": "a", "index": "3"}).to_string(),
        json!({"from": 1, "setlistId": "gig", "songId": "a", "index": 3}).to_string(),
        json!([1, 2, 3]).to_string(),
    ];
    for body in refused {
        let answer = companion.request("POST", "/position", &body);
        assert_eq!(answer.status, 400, "{body}");
        assert_eq!(answer.json(), json!({"error": "bad-request"}));
    }
    for query in ["after=abc", "wait=-1", "wait=soon"] {
        assert_eq!(companion.get(&format!("/position?{query}")).status, 400);
    }
    assert_eq!(companion.get("/position?wait=0").status, 204);
}

#[test]
fn position_is_held_until_the_next_one_or_until_the_wait_runs_out() {
    let companion = Arc::new(Companion::start());
    companion.post("/position", &position(0));

    let started = Instant::now();
    assert_eq!(companion.get("/position?after=1&wait=1").status, 204);
    assert!(started.elapsed() >= Duration::from_millis(900));

    let waiting = {
        let companion = companion.clone();
        thread::spawn(move || companion.get("/position?after=1&wait=20"))
    };
    thread::sleep(Duration::from_millis(200));
    let started = Instant::now();
    companion.post("/position", &position(1));
    let answer = waiting.join().unwrap();
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json(), json!({"seq": 2, "position": position(1)}));
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn waiting_tablets_hold_up_neither_each_other_nor_the_midi() {
    let companion = Arc::new(Companion::start());
    let tablets: Vec<_> = (0..12)
        .map(|_| {
            let companion = companion.clone();
            thread::spawn(move || companion.get("/position?after=0&wait=20"))
        })
        .collect();
    thread::sleep(Duration::from_millis(300));

    let started = Instant::now();
    let played = companion.post("/midi", &json!({"messages": [[176, 20, 6]]}));
    assert_eq!(played.status, 200);
    assert_eq!(companion.get("/status").status, 200);
    assert!(started.elapsed() < Duration::from_secs(2));

    companion.post("/position", &position(7));
    for tablet in tablets {
        let answer = tablet.join().unwrap();
        assert_eq!(answer.json(), json!({"seq": 1, "position": position(7)}));
    }
    assert!(started.elapsed() < Duration::from_secs(5));
}

#[test]
fn the_status_page_is_at_the_root() {
    let companion = Companion::start();
    let answer = companion.get("/");
    assert_eq!(answer.status, 200);
    assert_eq!(
        answer.header("content-type"),
        Some("text/html; charset=utf-8")
    );
    assert!(
        answer
            .body
            .contains("<title>Open Setlist Companion</title>")
    );
    assert!(answer.body.contains("Stage PC"));
}

#[test]
fn anything_else_is_not_found() {
    let companion = Companion::start();
    let requests = [
        ("GET", "/nowhere"),
        ("GET", "/midi"),
        ("POST", "/status"),
        ("POST", "/"),
        ("PUT", "/midi"),
        ("DELETE", "/position"),
        ("GET", "/status/more"),
    ];
    for (method, path) in requests {
        let answer = companion.request(method, path, "");
        assert_eq!(answer.status, 404, "{method} {path}");
        assert_eq!(answer.json(), json!({"error": "not-found"}));
    }
}
