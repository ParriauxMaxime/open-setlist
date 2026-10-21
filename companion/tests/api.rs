//! The protocol the web app is written against, over a real socket, with a MIDI output
//! that only remembers what it was sent.

mod common;

use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use open_setlist_companion::fake::FakeOut;
use open_setlist_companion::hub::{Bluetooth, Hub};
use open_setlist_companion::server::{self, Settings};
use open_setlist_companion::tls;
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
        Self::forgetting_after(Duration::from_secs(15))
    }

    /// A companion that forgets a silent tablet after `silence`.
    fn forgetting_after(silence: Duration) -> Self {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let out = Arc::new(FakeOut::default());
        let hub = Arc::new(Hub::new(out.clone(), Bluetooth::Off).forgetting_after(silence));
        let settings = Settings {
            name: "Stage PC".to_string(),
            local_name: None,
            port,
            app_url: "https://example.org/settings".to_string(),
        };
        let certificates = std::env::temp_dir().join(format!("{}-api-test", server::APP));
        let tls = tls::config(&certificates).unwrap();
        server::start(listener, hub.clone(), settings, Some(tls)).unwrap();
        Self { port, out, hub }
    }

    /// The same request as `request`, but spoken over TLS without checking the certificate,
    /// the way a browser does once the musician accepted it.
    fn secure_request(&self, method: &str, path: &str, body: &str) -> Answer {
        let config = rustls::ClientConfig::builder()
            .dangerous()
            .with_custom_certificate_verifier(Arc::new(TrustAnything))
            .with_no_client_auth();
        let name = rustls::pki_types::ServerName::try_from("localhost").unwrap();
        let connection = rustls::ClientConnection::new(Arc::new(config), name).unwrap();
        let socket = common::connect(self.port).unwrap();
        let mut stream = rustls::StreamOwned::new(connection, socket);
        write!(
            stream,
            "{method} {path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        )
        .unwrap();
        let mut raw = String::new();
        stream.read_to_string(&mut raw).unwrap();
        common::parse(&raw).expect("an answer")
    }
}

#[derive(Debug)]
struct TrustAnything;

impl rustls::client::danger::ServerCertVerifier for TrustAnything {
    fn verify_server_cert(
        &self,
        _: &rustls::pki_types::CertificateDer<'_>,
        _: &[rustls::pki_types::CertificateDer<'_>],
        _: &rustls::pki_types::ServerName<'_>,
        _: &[u8],
        _: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _: &[u8],
        _: &rustls::pki_types::CertificateDer<'_>,
        _: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _: &[u8],
        _: &rustls::pki_types::CertificateDer<'_>,
        _: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

impl Companion {
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

fn presence(id: &str, page: &str) -> Value {
    json!({
        "id": id,
        "name": "Keys · iPad",
        "part": "keys",
        "platform": "iPad",
        "appVersion": "0.1.0",
        "page": page,
        "follow": "off",
        "midi": {"transport": "wifi", "lastSend": "none"},
    })
}

#[test]
fn status_describes_the_companion() {
    let companion = Companion::start();
    let answer = companion.get("/status");
    assert_eq!(answer.status, 200);
    assert_eq!(answer.header("content-type"), Some("application/json"));
    let mut status = answer.json();
    assert!(status["uptime"].is_u64());
    status.as_object_mut().unwrap().remove("uptime");
    assert_eq!(
        status,
        json!({
            "app": "open-setlist-companion",
            "version": env!("CARGO_PKG_VERSION"),
            "name": "Stage PC",
            "midiOut": "Fake",
            "midiIn": null,
            "bluetooth": "off",
            "sent": 0,
            "recent": [],
            "feedback": { "seq": 0, "state": [] },
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
        companion.post("/presence", &presence("tablet-1", "Catalog")),
        companion.get("/devices?after=1&wait=0"),
        companion.get("/log?wait=0"),
        companion.request("OPTIONS", "/midi", ""),
        {
            companion.out.unplug();
            companion.post("/midi", &json!({"messages": [[176, 20, 6]]}))
        },
    ];
    let statuses: Vec<u16> = answers.iter().map(|answer| answer.status).collect();
    assert_eq!(
        statuses,
        [
            200, 200, 204, 400, 404, 200, 400, 200, 200, 204, 200, 204, 503
        ]
    );
    for answer in &answers {
        for (name, value) in HEADERS {
            assert_eq!(answer.header(name), Some(value), "{name}");
        }
    }
}

/// Firefox and Safari refuse a plain-HTTP call from a page served over HTTPS: the same port
/// answers over TLS too, with the certificate the musician accepted once.
#[test]
fn the_same_port_answers_over_tls() {
    let companion = Companion::start();
    let answer = companion.secure_request("GET", "/status", "");
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json()["app"], "open-setlist-companion");
    let answer = companion.secure_request(
        "POST",
        "/midi",
        &json!({"messages": [[176, 20, 6]]}).to_string(),
    );
    assert_eq!(answer.json(), json!({"sent": 1}));
    assert_eq!(answer.header("access-control-allow-origin"), Some("*"));
    assert_eq!(companion.get("/status").json()["sent"], 1);
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
fn feedback_is_held_until_the_gear_answers() {
    let companion = Companion::start();
    assert_eq!(companion.get("/feedback?wait=0").status, 204);

    companion.hub.feedback.receive(vec![176, 21, 1]);
    companion.hub.feedback.receive(vec![176, 20, 22]);
    let answer = companion.get("/feedback");
    assert_eq!(answer.status, 200);
    assert_eq!(
        answer.json(),
        json!({"seq": 2, "state": [[176, 20, 22], [176, 21, 1]]})
    );
    assert_eq!(companion.get("/feedback?after=2&wait=0").status, 204);

    let waiting = {
        let port = companion.port;
        thread::spawn(move || common::request(port, "GET", "/feedback?after=2", "").unwrap())
    };
    thread::sleep(Duration::from_millis(100));
    companion.hub.set_midi_in(Some("Open Setlist".to_string()));
    companion.hub.feedback.receive(vec![176, 20, 13]);
    let answer = waiting.join().unwrap();
    assert_eq!(
        answer.json(),
        json!({"seq": 3, "state": [[176, 20, 13], [176, 21, 1]]})
    );
    let status = companion.get("/status").json();
    assert_eq!(status["midiIn"], "Open Setlist");
    assert_eq!(status["feedback"]["seq"], 3);
}

#[test]
fn presence_keeps_one_entry_per_device() {
    let companion = Companion::start();
    assert_eq!(companion.get("/devices?wait=0").status, 204);
    let before = unix_ms();

    let answer = companion.post("/presence", &presence("tablet-1", "Catalog"));
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json(), json!({"seq": 1}));
    companion.post("/presence", &presence("tablet-2", "Settings"));
    let answer = companion.post("/presence", &presence("tablet-1", "Perform"));
    assert_eq!(answer.json(), json!({"seq": 3}));

    let answer = companion.get("/devices?after=0");
    assert_eq!(answer.status, 200);
    let reply = answer.json();
    assert_eq!(reply["seq"], 3);
    assert!(reply["now"].as_u64().unwrap() >= before);
    let devices = reply["devices"].as_array().unwrap();
    assert_eq!(devices.len(), 2);
    let mut first = devices[0].clone();
    let seen = first["lastSeen"].as_u64().unwrap();
    assert!((before..=unix_ms()).contains(&seen));
    first.as_object_mut().unwrap().remove("lastSeen");
    let mut expected = presence("tablet-1", "Perform");
    expected["address"] = json!("127.0.0.1");
    assert_eq!(first, expected);
    assert_eq!(devices[1]["page"], "Settings");
}

#[test]
fn presence_refuses_what_names_no_device() {
    let companion = Companion::start();
    let refused = [
        "not json".to_string(),
        json!({"name": "Keys"}).to_string(),
        json!({"id": "", "name": "Keys"}).to_string(),
        json!({"id": 1, "name": "Keys"}).to_string(),
        json!({"id": "tablet-1"}).to_string(),
        json!(["tablet-1"]).to_string(),
    ];
    for body in refused {
        let answer = companion.request("POST", "/presence", &body);
        assert_eq!(answer.status, 400, "{body}");
        assert_eq!(answer.json(), json!({"error": "bad-request"}));
    }
    for query in ["after=abc", "wait=soon"] {
        assert_eq!(companion.get(&format!("/devices?{query}")).status, 400);
    }
    assert_eq!(companion.get("/devices?wait=0").status, 204);
}

#[test]
fn devices_are_held_until_a_tablet_comes_or_goes() {
    let companion = Companion::forgetting_after(Duration::from_millis(400));
    let waiting = {
        let port = companion.port;
        thread::spawn(move || common::request(port, "GET", "/devices?after=0&wait=20", "").unwrap())
    };
    thread::sleep(Duration::from_millis(100));
    let started = Instant::now();
    companion.post("/presence", &presence("tablet-1", "Catalog"));
    let answer = waiting.join().unwrap();
    assert_eq!(answer.json()["seq"], 1);
    assert_eq!(answer.json()["devices"][0]["id"], "tablet-1");
    assert!(started.elapsed() < Duration::from_secs(2));

    // Silent from now on: forgotten, and the page that waits is told
    let answer = companion.get("/devices?after=1&wait=5");
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json()["seq"], 2);
    assert_eq!(answer.json()["devices"], json!([]));
    assert!(started.elapsed() >= Duration::from_millis(400));
    assert!(started.elapsed() < Duration::from_secs(3));
}

#[test]
fn a_tablet_that_keeps_reporting_stays() {
    let companion = Companion::forgetting_after(Duration::from_millis(400));
    for _ in 0..6 {
        companion.post("/presence", &presence("tablet-1", "Catalog"));
        thread::sleep(Duration::from_millis(150));
    }
    let answer = companion.get("/devices");
    assert_eq!(answer.json()["seq"], 6);
    assert_eq!(answer.json()["devices"].as_array().unwrap().len(), 1);
}

#[test]
fn log_gives_the_last_batches_newest_first() {
    let companion = Companion::start();
    assert_eq!(companion.get("/log?wait=0").status, 204);
    let before = unix_ms();
    companion.post(
        "/midi",
        &json!({"messages": [[158, 111, 100], [142, 111, 0]], "from": "keys", "device": "tablet-1"}),
    );
    companion.post("/midi", &json!({"messages": [[193, 11]], "from": "bass"}));

    let reply = companion.get("/log?after=0").json();
    assert_eq!(reply["seq"], 2);
    assert!(reply["now"].as_u64().unwrap() >= before);
    let entries = reply["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0]["seq"], 2);
    assert_eq!(entries[0]["from"], "bass");
    assert_eq!(entries[0].get("device"), None);
    assert_eq!(entries[1]["seq"], 1);
    assert_eq!(entries[1]["device"], "tablet-1");
    assert_eq!(entries[1]["via"], "wifi");
    assert_eq!(
        entries[1]["messages"],
        json!([[158, 111, 100], [142, 111, 0]])
    );
    assert!((before..=unix_ms()).contains(&entries[1]["at"].as_u64().unwrap()));
    assert_eq!(
        companion.get("/status").json()["recent"][1]["device"],
        "tablet-1"
    );

    assert_eq!(companion.get("/log?after=2&wait=0").status, 204);
    let waiting = {
        let port = companion.port;
        thread::spawn(move || common::request(port, "GET", "/log?after=2&wait=20", "").unwrap())
    };
    thread::sleep(Duration::from_millis(100));
    companion.post("/midi", &json!({"messages": [[176, 20, 6]]}));
    let reply = waiting.join().unwrap().json();
    assert_eq!(reply["seq"], 3);
    assert_eq!(reply["entries"][0]["messages"], json!([[176, 20, 6]]));
}

#[test]
fn log_keeps_fifty_batches_and_the_status_twenty() {
    let companion = Companion::start();
    for program in 0..55 {
        companion.post("/midi", &json!({"messages": [[192, program]]}));
    }
    let entries = companion.get("/log").json()["entries"].clone();
    assert_eq!(entries.as_array().unwrap().len(), 50);
    assert_eq!(entries[0]["messages"], json!([[192, 54]]));
    assert_eq!(entries[49]["seq"], 6);
    let status = companion.get("/status").json();
    assert_eq!(status["recent"].as_array().unwrap().len(), 20);
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

#[test]
fn every_answer_ends_the_connection_and_only_some_have_a_body() {
    let companion = Companion::start();
    let status = companion.get("/status");
    assert_eq!(status.header("connection"), Some("close"));
    assert_eq!(
        status.header("content-length"),
        Some(status.body.len().to_string().as_str())
    );

    let nothing = companion.get("/position?wait=0");
    assert_eq!(nothing.status, 204);
    assert_eq!(nothing.header("content-length"), None);
    assert_eq!(nothing.body, "");

    let head = companion.request("HEAD", "/status", "");
    assert_eq!(head.status, 404);
    assert_eq!(head.body, "");
}

#[test]
fn a_request_that_arrives_in_pieces_is_put_back_together() {
    let companion = Companion::start();
    let body = json!({"messages": [[176, 20, 6]], "from": "Keys"}).to_string();
    let (first, second) = body.split_at(body.len() / 2);
    let head = format!(
        "POST /midi HTTP/1.1\r\nHost: localhost\r\ncontent-length: {}\r\n",
        body.len()
    );
    let pieces = ["POST /mi", &head["POST /mi".len()..], "\r\n", first, second];
    let answer = common::send(companion.port, &pieces, Duration::from_millis(30)).unwrap();
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json(), json!({"sent": 1}));
    assert_eq!(companion.out.played(), vec![vec![176, 20, 6]]);
}

#[test]
fn a_tablet_that_stalls_halfway_holds_up_nobody() {
    let companion = Companion::start();
    let stalled: Vec<_> = (0..20)
        .map(|_| {
            let mut stream = common::connect(companion.port).unwrap();
            stream
                .write_all(b"POST /midi HTTP/1.1\r\nContent-Length: 40\r\n\r\n{\"mess")
                .unwrap();
            stream
        })
        .collect();
    let started = Instant::now();
    let answer = companion.post("/midi", &json!({"messages": [[176, 20, 6]]}));
    assert_eq!(answer.json(), json!({"sent": 1}));
    assert_eq!(companion.get("/status").json()["sent"], 1);
    assert!(started.elapsed() < Duration::from_secs(2));
    drop(stalled);
}

#[test]
fn what_is_not_http_is_refused_and_the_next_tablet_is_served() {
    let companion = Companion::start();
    let unsupported = "POST /midi HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n";
    for nonsense in ["hello\r\n\r\n", "\u{1}\u{2}\u{3}\r\n\r\n", unsupported] {
        let answer = common::send(companion.port, &[nonsense], Duration::ZERO).unwrap();
        assert_eq!(answer.status, 400, "{nonsense:?}");
        assert_eq!(answer.json(), json!({"error": "bad-request"}));
        assert_eq!(answer.header("access-control-allow-origin"), Some("*"));
    }
    let silent = common::connect(companion.port).unwrap();
    drop(silent);
    assert_eq!(companion.get("/status").status, 200);
}

#[test]
fn a_client_that_waits_for_a_go_ahead_gets_one() {
    let companion = Companion::start();
    let body = json!({"messages": [[176, 20, 6]]}).to_string();
    let mut stream = common::connect(companion.port).unwrap();
    write!(
        stream,
        "POST /midi HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\nExpect: 100-continue\r\n\r\n",
        body.len()
    )
    .unwrap();
    let mut go_ahead = [0; 25];
    stream.read_exact(&mut go_ahead).unwrap();
    assert_eq!(&go_ahead, b"HTTP/1.1 100 Continue\r\n\r\n");
    stream.write_all(body.as_bytes()).unwrap();
    let answer = common::answer(&mut stream).unwrap();
    assert_eq!(answer.status, 200);
    assert_eq!(answer.json(), json!({"sent": 1}));
}
