#[cfg(target_os = "macos")]
mod macos;

use std::convert::Infallible;
use std::io::{self, ErrorKind, IsTerminal, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::process::{Command, ExitCode, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use open_setlist_companion::cli::{self, Options, USAGE};
use open_setlist_companion::hub::{Bluetooth, Hub};
use open_setlist_companion::inputs::Inputs;
use open_setlist_companion::midi::{MidiOut, PORT_NAME};
use open_setlist_companion::ports::{self, Ports};
use open_setlist_companion::server::{self, APP, Settings};
use open_setlist_companion::{ble, net};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const LOOK_FOR_PORTS: Duration = Duration::from_secs(3);
const LOOPMIDI_URL: &str = "https://www.tobias-erichsen.de/software/loopmidi.html";

fn main() -> ExitCode {
    let options = match cli::parse(std::env::args().skip(1)) {
        Ok(cli::Command::Run(options)) => options,
        Ok(cli::Command::List) => {
            let names = ports::list();
            if names.is_empty() {
                println!("No MIDI output on this computer.");
            }
            for name in names {
                println!("{name}");
            }
            return ExitCode::SUCCESS;
        }
        Ok(cli::Command::Help) => {
            println!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Ok(cli::Command::Version) => {
            println!("{APP} {VERSION}");
            return ExitCode::SUCCESS;
        }
        Err(message) => {
            eprintln!("{message}\n\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    #[cfg(target_os = "macos")]
    let may_use_bluetooth = !options.bluetooth || macos::answer_for_itself();
    #[cfg(not(target_os = "macos"))]
    let may_use_bluetooth = true;

    let started = listen(&options).and_then(|listener| match listener {
        Some(listener) => run(options, listener, may_use_bluetooth).map(|never| match never {}),
        None => Ok(()),
    });
    match started {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            // Started with a double click on Windows, the window would close on the message.
            if cfg!(windows) && io::stdin().is_terminal() {
                eprintln!("Press Enter to close.");
                let _ = io::stdin().read_line(&mut String::new());
            }
            ExitCode::FAILURE
        }
    }
}

/// The socket tablets connect to, or `None` when the companion already runs: its status
/// page is then shown instead of starting a second one.
fn listen(options: &Options) -> Result<Option<TcpListener>, String> {
    // No authentication: the companion is only reachable on the band's own router, which
    // has no way out to the internet.
    match TcpListener::bind((Ipv4Addr::UNSPECIFIED, options.port)) {
        Ok(listener) => Ok(Some(listener)),
        Err(error) if error.kind() == ErrorKind::AddrInUse && is_running(options.port) => {
            let page = status_page(options.port);
            println!("Open Setlist Companion is already running: {page}");
            if options.open {
                open_in_browser(&page);
            }
            Ok(None)
        }
        Err(error) => Err(format!(
            "Cannot listen on port {}: {error}.\nIf another program uses that port, start with --port 7778 and use that number in Open Setlist.",
            options.port
        )),
    }
}

fn run(
    options: Options,
    listener: TcpListener,
    may_use_bluetooth: bool,
) -> Result<Infallible, String> {
    let port = listener
        .local_addr()
        .map_or(options.port, |address| address.port());

    let ports = Arc::new(Ports::new(options.out.clone(), options.also));
    ports.refresh();
    let bluetooth = if options.bluetooth {
        Bluetooth::Starting
    } else {
        Bluetooth::Off
    };
    let hub = Arc::new(Hub::new(ports.clone(), bluetooth));
    let inputs = Inputs::new(options.input.clone(), hub.feedback.clone());
    inputs.refresh();
    hub.set_midi_in(inputs.name());
    let settings = Settings {
        name: net::computer_name(),
        local_name: net::local_name(),
        port,
        app_url: options.app_url,
    };

    println!("Open Setlist Companion {VERSION} on {}\n", settings.name);
    print_addresses(&settings);
    let mut midi_out = ports.name();
    print_midi(midi_out.as_deref(), options.out.as_deref());
    let mut midi_in = inputs.name();
    print_midi_in(midi_in.as_deref());
    for (wanted, found) in ports.copies() {
        match found {
            Some(name) => println!("Copy to:     {name}"),
            None => println!("Copy to:     nothing found for \"{wanted}\" yet"),
        }
    }
    if !options.bluetooth {
        println!("Bluetooth:   off");
    }
    println!("\nStatus page: {}", status_page(port));
    println!("Keep this window open. Close it to stop.\n");

    server::start(listener, hub.clone(), settings)
        .map_err(|error| format!("Cannot start: {error}."))?;
    if !may_use_bluetooth {
        ble::unavailable(&hub, "macOS did not let this program ask for it");
    } else if options.bluetooth {
        ble::start(hub.clone());
    }
    if options.open {
        open_in_browser(&status_page(port));
    }

    loop {
        thread::sleep(LOOK_FOR_PORTS);
        ports.refresh();
        let now = ports.name();
        if now != midi_out {
            print_midi(now.as_deref(), options.out.as_deref());
            midi_out = now;
        }
        inputs.refresh();
        let now = inputs.name();
        if now != midi_in {
            print_midi_in(now.as_deref());
            hub.set_midi_in(now.clone());
            midi_in = now;
        }
    }
}

fn status_page(port: u16) -> String {
    format!("http://localhost:{port}")
}

fn print_addresses(settings: &Settings) {
    let addresses = net::addresses();
    if addresses.is_empty() {
        println!("This computer is not on a network yet. Join the band's Wi-Fi:");
        println!("the status page will show the address to use.\n");
        return;
    }
    println!("In Open Setlist, on each tablet, enter this address:\n");
    let hosts = addresses
        .iter()
        .map(|address| address.to_string())
        .chain(settings.local_name.clone());
    for (index, host) in hosts.enumerate() {
        let or = if index == 0 { "  " } else { "or" };
        println!("  {or} http://{host}:{}", settings.port);
    }
    println!();
}

fn print_midi(found: Option<&str>, wanted: Option<&str>) {
    match (found, wanted) {
        (Some(name), _) => {
            println!("MIDI output: {name} (in Ableton Live, turn it on as a MIDI input)")
        }
        (None, Some(wanted)) => {
            println!("MIDI output: nothing found for \"{wanted}\" yet (--list shows what exists)")
        }
        (None, None) if cfg!(windows) => {
            println!("MIDI output: none yet. Install loopMIDI (free) and add a port named");
            println!("             \"{PORT_NAME}\": it is found within a few seconds.");
            println!("             {LOOPMIDI_URL}");
        }
        (None, None) => println!("MIDI output: the \"{PORT_NAME}\" port could not be created"),
    }
}

fn print_midi_in(found: Option<&str>) {
    match found {
        Some(name) => {
            println!(
                "MIDI input:  {name} (in Ableton Live, turn it on as a MIDI output with Remote)"
            )
        }
        None if cfg!(windows) => {
            println!("MIDI input:  none. For Ableton's answers, add a loopMIDI port named");
            println!("             \"{PORT_NAME} Feedback\" or start with --in <name>.");
            println!("             {LOOPMIDI_URL}");
        }
        None => println!("MIDI input:  the \"{PORT_NAME}\" port could not be created"),
    }
}

/// Whether the program that holds the port is this one.
fn is_running(port: u16) -> bool {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_secs(1)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = "GET /status HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    let mut answer = String::new();
    stream.write_all(request.as_bytes()).is_ok()
        && stream.read_to_string(&mut answer).is_ok()
        && answer.contains(&format!("\"app\":\"{APP}\""))
}

fn open_in_browser(url: &str) {
    let (program, arguments): (&str, &[&str]) = if cfg!(target_os = "macos") {
        ("open", &[])
    } else if cfg!(windows) {
        ("cmd", &["/C", "start", ""])
    } else {
        ("xdg-open", &[])
    };
    let opened = Command::new(program)
        .args(arguments)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    if let Ok(mut child) = opened {
        // Some openers only return when the browser closes.
        thread::spawn(move || child.wait());
    }
}
