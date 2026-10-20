# MIDI on stage

When a musician changes song in performance mode, their device can make their own gear change sound. Everything is opt-in per device and nothing goes through the internet: a gig has no connection, and the project runs no server for it.

## What is sent

Each song has one **sound code** per instrument (`src/domain/midi/patch.ts`):

- A field per instrument on the song (editor → Sounds (MIDI)), stored in `Song.patches`. Usually a plain preset number; a song without one sends nothing for that instrument.
- The keyboard player's synth code stays in the chart's setup line, the first comment (`{comment:17A🎸}`: two digits 1 to 8 and a letter A to D). The editor shows it next to the field as a reading aid; it is never sent. The band maps each song to a MIDI number by hand, since 128 sounds are enough in Ableton for now.

A device sends only the code of its own instrument (Settings → Stage: MIDI → My instrument), on its own MIDI channel, so several musicians can send to the same computer:

| Instrument | Default channel | Default message |
|---|---|---|
| Keys | 1 | One Control Change: CC 20 = the song's number, 0 to 127 |
| Guitar, bass, vocals | 2, 3, 4 | Program Change (preset 1 = program 0), preceded by Bank Select (CC 0) when the code has a letter |
| Drums | 10 | same |
| Others | 5 | same |

Channel, message type and controller numbers can be changed per device (MIDI details).

A song whose keyboard number is `111`, on channel 16, sends exactly `[0xBF, 20, 111]`. Over Control Change only a number from 0 to 127 is sent: a lettered code or `128` sends nothing, and the song editor flags it.

One Control Change for the keyboard because Ableton Live maps notes and CC but not Program Change, and a Live mapping listens to one controller only. CC 20 is one of the undefined controllers (20 to 31): Bank Select (CC 0 and 32) could clash with other gear on the chain. 256 sounds would need two controllers and logic in Live; the band does not need more than 128 for now.

### In Ableton Live

1. Preferences → Link, Tempo & MIDI → MIDI Ports. On the input `Open Setlist` (on Windows, the loopMIDI port), turn **Remote** on. On the keyboard's own input, turn **Remote** off, keep **Track** on: Live maps the last message it receives on any Remote input, and the keyboard's pitch wheel would win.
2. One Instrument Rack on the keyboard track, one chain per sound. Show the chain list and its **Chain** zone editor; give each chain a zone of one value: the sound's number (chain for song number 111: zone 111 to 111).
3. Press **MIDI** (Cmd+M / Ctrl+M) for MIDI Map mode and click the rack's chain selector (or a Macro mapped to it, range 0 to 127).
4. In Open Setlist, Settings → Stage: MIDI → Try it: type a number and press **Send**. Live's status bar must read `MIDI Ch1 #20` (or the device's channel), not `Pitch Bend`. Leave MIDI Map mode.
5. In MIDI Map mode, the mapping list on the left shows each mapping: delete any `Pitch Bend` one made by mistake.

Layers inside a sound (strings on top of the piano) are not Open Setlist's job: the synth sends those to Ableton itself.

## How it gets there

```
Tablet ── Wi-Fi (band router, no internet) ──▶ companion program ──▶ virtual MIDI port ──▶ Ableton
Tablet ── Bluetooth MIDI ────────────────────▶ on the stage computer ─▶ hardware by cable
Tablet ── Bluetooth MIDI ────────────────────▶ any BLE MIDI device
```

**Wi-Fi** (`src/domain/midi/companion.ts`). The companion program (`companion/`, one file to run on Windows, macOS or Linux, see its README) listens on port 7777 of the stage computer. On macOS and Linux it creates a MIDI port named `Open Setlist`; Windows cannot do that, so it uses a loopMIDI port of that name. The app is served over HTTPS and the companion sits on a private address, where it answers both plain HTTP and HTTPS on that one port (`companion/src/tls.rs` reads the first byte of each connection). Chrome lets the plain call through after asking the musician once (Local Network Access). Verified in Chrome 155 on a computer: with the permission, `https://…github.io` reaches `http://192.168.x.x:7777`, loopback and `.local` names; without it the request is blocked. Firefox and Safari block that call outright and take the HTTPS one instead: the certificate is self-signed, so the musician opens `https://192.168.x.x:7777` once on the tablet and accepts the warning. Browsers tie that exception to the certificate, which the companion keeps in its config folder across runs. The app probes HTTPS first, then HTTP (`probeCompanion`), and keeps the scheme that answered.

**Answers from the gear** (`awaitConfirmation` in `companion.ts`, `companion/src/feedback.rs`). The companion also opens a MIDI input: on macOS and Linux a second `Open Setlist` port, which Live sees as an output. With Remote enabled on that output, Live echoes the value of each mapped control when it changes. The companion keeps the last value of each control and serves it on `GET /feedback`. After a send over Wi-Fi, the tablet waits up to 5 s for a state that contains every message it sent; the MIDI chip then turns green ("taken by your gear"). Live only echoes on change, so a song that asks for the sound already selected is confirmed by the value echoed earlier; with no echo at all (no Remote on the output, hardware that does not answer) the chip stays blue. Bluetooth has no feedback. On Windows the input is a second loopMIDI port whose name contains `feedback`, or `--in <name>`: the port the companion plays on would give its own messages back.

**Bluetooth** (`src/domain/midi/bluetooth.ts`). The app is a standard BLE MIDI central through Web Bluetooth (Chrome and Edge, Android and desktop). It connects to the companion program, which advertises as a BLE MIDI device, or straight to BLE MIDI hardware. The browser forgets the device when the page reloads: one tap on the MIDI chip reconnects.

**Follow the leader** (`src/modules/performance/hooks/use-follow-leader.ts`). Optional and off by default: a leading device posts its position (setlist, song, slot) to the companion program, following devices wait on it and jump to that song. Local network only; it needs the Wi-Fi transport.

## Companion protocol

HTTP on port 7777, JSON, open to any origin (it is only reachable on the band's own network). POST bodies are sent as `text/plain` so that no CORS preflight delays a song change.

| Request | Result |
|---|---|
| `GET /status` | name, version, MIDI output and input in use, Bluetooth state, last messages, last answers from the gear |
| `POST /midi` `{"messages":[[176,21,0],[176,20,6]],"from":"keys"}` | 200 `{"sent":2}`; 400 if malformed; 503 without a MIDI output |
| `POST /position` `{"from","setlistId","songId","index"}` | 200 `{"seq":n}` |
| `GET /position?after=<seq>&wait=<s>` | 200 `{"seq","position"}` as soon as there is a newer one, else 204 after the wait |
| `GET /feedback?after=<seq>&wait=<s>` | 200 `{"seq","state":[[176,20,22],[176,21,1]]}`, the last value of each control the gear sent back, as soon as newer than `after`, else 204 after the wait |
| `GET /` | status page for the person at the computer, with a QR code that sets a tablet up |

The QR code opens `…/settings?companion=<address>`: the app stores the address and shows the MIDI settings.

## Not verified yet

- Chrome on Android asking for and honouring the local network permission.
- The Bluetooth transport end to end: no tablet has connected to the companion yet.
- The companion program at run time on Windows (never started on a real one) and on Linux with a real ALSA sequencer and BlueZ.
- Ableton Live mapping CC 20 to a chain selector and switching chains, and echoing it on the `Open Setlist` output. On 2026-10-19 Live reported a pitch bend instead; the companion writes exactly the Control Change it receives (`cargo test --test loopback -- --ignored`, macOS), so the pitch bend most likely came from another Remote input, such as the keyboard's wheel. The Ableton steps above are not tried on Live yet.
- Whether the drum pad and the pedalboard accept Program Change, and on which channel.
