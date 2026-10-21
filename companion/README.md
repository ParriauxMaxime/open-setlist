# Open Setlist Companion

A small program for the computer that runs Ableton Live on stage. When a musician changes
song in Open Setlist, their tablet sends MIDI messages to this program, which plays them out
of a MIDI port that Ableton listens to. It also tells the tablets that follow which song the
leader is on.

Everything stays on the band's own Wi-Fi router: no internet, no account, no server.

```
Tablets -- Wi-Fi, HTTP or HTTPS on port 7777 --+
                                      +--> companion --> "Open Setlist" MIDI port --> Ableton Live
Tablets -- Bluetooth, BLE MIDI -------+             \--> --also outputs: drum pad, pedalboard
```

## Using it

Run the file for your system (from the releases named `companion-v…`). It prints the
address to enter in Open Setlist and opens a status page with that address, a QR code that
sets a tablet up without typing, the MIDI output in use and the last messages received.
Keep it running during the gig; close its window to stop it.

- **macOS and Linux**: a MIDI port named `Open Setlist` appears while the program runs.
  Turn it on as a MIDI input in Ableton. A downloaded file must first be made executable
  (`chmod +x open-setlist-companion-macos`), and macOS asks to confirm an unsigned program
  in System Settings > Privacy & Security.
- **Windows**: a program cannot create a MIDI port there. Install
  [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html), add a port named
  `Open Setlist`, and the companion finds it within a few seconds. Without `--out` it takes
  the first output whose name contains `open setlist`, else `loopmidi`, else `loopback`
  (the name of the loopback ports Microsoft announces for Windows MIDI Services). Windows
  asks twice on the first run: to run an unsigned program (More info > Run anyway), and to
  let it through the firewall. Allow the firewall, or tablets cannot reach it.
- **Answers from Ableton**: the program also listens on a MIDI input. On macOS and Linux it
  is a second `Open Setlist` port, which Ableton sees as an output: turn it on with Remote,
  and Live echoes the value of each mapped control when it changes. Tablets read those
  answers to confirm that the sound change was taken. On Windows, add a second loopMIDI
  port whose name contains `feedback` and send Ableton's output there, or use `--in`.
- **Firefox and Safari** on a tablet refuse a plain-HTTP call from Open Setlist, which is
  served over HTTPS. The companion also answers HTTPS on the same port, with a certificate
  it signs itself and keeps in its config folder (`~/Library/Application Support`,
  `%APPDATA%` or `~/.config`, under `open-setlist-companion`). Open `https://<address>` once
  on the tablet, accept the warning, and Open Setlist reaches it from then on. Chrome needs
  none of this: it asks once to reach the local network.
- **Bluetooth**: tablets find the computer as a BLE MIDI device named `Open Setlist`
  (under the computer's own name on Windows). macOS asks to allow Bluetooth the first time
  a given file is run.

## Options

| Option | |
|---|---|
| `--out <name>` | Send MIDI to the existing output whose name contains `<name>` |
| `--in <name>` | Listen for the gear's answers on the existing input whose name contains `<name>` |
| `--also <name>` | Also send every message to that output; can be repeated |
| `--list` | List the MIDI outputs of this computer, then quit |
| `--port <number>` | Listen on another port than 7777 |
| `--app-url <url>` | Address of Open Setlist, for the QR code |
| `--no-bluetooth` | Do not receive MIDI over Bluetooth |
| `--no-open` | Do not open the status page in the browser |

## What tablets send

JSON over HTTP, answered with the headers a web page from another origin needs.

| Request | Answer |
|---|---|
| `GET /status` | Name, version, seconds since it started, MIDI output, Bluetooth state, last 20 batches |
| `POST /midi` `{"messages":[[176,20,6]],"from":"Keys","device":"<id>"}` | `{"sent":1}`; 400 if a message is not a channel voice message, 503 without a MIDI output. `device` is optional |
| `POST /position` `{"from","setlistId","songId","index"}` | `{"seq":1}` |
| `GET /position?after=<seq>&wait=<seconds>` | The latest position once it is newer than `after`, or 204 when the wait runs out |
| `GET /feedback?after=<seq>&wait=<seconds>` | `{"seq":3,"state":[[176,20,22],[176,21,1]]}`, the last value of each control the gear sent back, once newer than `after`; 204 when the wait runs out |
| `POST /presence` `{"id","name","part","platform","page","follow","midi",…}` | `{"seq":4}`; 400 without an `id` and a `name`. Each tablet sends it every 5 seconds; one silent for 15 seconds is forgotten |
| `GET /devices?after=<seq>&wait=<seconds>` | `{"seq","now","devices":[…]}`, each report as it came with `address` and `lastSeen`, once newer than `after`; 204 when the wait runs out |
| `GET /log?after=<seq>&wait=<seconds>` | `{"seq","now","entries":[…]}`, the last 50 batches played, newest first, once newer than `after`; 204 when the wait runs out |
| `GET /` | The status page |

There is no authentication: the program is meant for a router that only the band uses.

## Building

Rust (stable) is all macOS and Windows need. On Linux, ALSA and D-Bus headers as well:
`sudo apt install libasound2-dev libdbus-1-dev pkg-config`.

```
cargo build --release      # target/release/open-setlist-companion
cargo test
cargo test --test loopback -- --ignored
```

The last command needs a real MIDI system (macOS or Linux): it starts the program, listens
to its `Open Setlist` port the way Ableton would, and checks that messages posted over HTTP
come out of it, and that `--out` and `--also` reach other outputs.

The workflow `.github/workflows/companion.yml` builds the three programs; a tag
`companion-v<version>` attaches them to a release.
