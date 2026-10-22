# MIDI on stage

When a musician changes song in performance mode, their device can make their own gear change sound. Everything is opt-in per device and nothing goes through the internet: a gig has no connection, and the project runs no server for it.

## What is sent

Each song has one **sound code** per instrument (`src/domain/midi/patch.ts`):

- A field per instrument on the song (editor → Sounds (MIDI)), stored in `Song.patches`. Usually a plain preset number; a song without one sends nothing for that instrument.
- The keyboard player's synth code stays in the chart's setup line, the first comment (`{comment:17A🎸}`: two digits 1 to 8 and a letter A to D). The editor shows it next to the field as a reading aid; it is never sent. The band maps each song to a MIDI number by hand, since 128 sounds are enough in Ableton for now.

A device sends only the code of its own instrument (Settings → Stage: MIDI → My instrument), on its own MIDI channel, so several musicians can send to the same computer:

| Instrument | Default channel | Default message |
|---|---|---|
| Keys | 15 | One short note: pitch = the song's number, 0 (C-2) to 127 (G8), velocity 100, Note Off right after |
| Guitar, bass, vocals | 2, 3, 4 | Program Change (preset 1 = program 0), preceded by Bank Select (CC 0) when the code has a letter |
| Drums | 10 | same |
| Others | 5 | same |

Channel, message type and controller numbers can be changed per device (MIDI details). A third type, one Control Change (CC 20 by default) whose value is the song's number, stays available for gear that maps CC values.

A song whose keyboard number is `111`, on channel 15, sends exactly `[0x9E, 111, 100]` then `[0x8E, 111, 0]`. As a note or over Control Change only a number from 0 to 127 is sent: a lettered code or `128` sends nothing, and the song editor flags it. The editor and the Try it field show the note name next to the number (`60` → `C3`).

Notes for the keyboard because Ableton Live maps a note to anything (a clip, a scene, a button, a chain selector) while a CC value only moves the parameter it is mapped to, and the band wants Live to switch sounds, not one parameter. With 128 pitches, 128 songs. Channel 15 so the keyboard's own notes, on channel 1, never trigger a song; channel 16 is spare for a second bank. The chart's `17A` code is never sent.

### In Ableton Live

1. Preferences → Link, Tempo & MIDI → MIDI Ports. On the input `Open Setlist` (on Windows, the loopMIDI port), turn **Remote** on. On the keyboard's own input, turn **Remote** off, keep **Track** on: Live maps the last message it receives on any Remote input, and the keyboard's pitch wheel would win.
2. Press **MIDI** (Cmd+M / Ctrl+M) for MIDI Map mode and click what the song must trigger: a clip or scene launch button, or a rack chain selector.
3. In Open Setlist, Settings → Stage: MIDI → Try it: type the song's number and press **Send**. Live's status bar must read the note on the device's channel (`C3 Ch15` for `60`), not `Pitch Bend`. Leave MIDI Map mode.
4. Repeat per song. In MIDI Map mode, the mapping list on the left shows each mapping: delete any `Pitch Bend` one made by mistake.

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

**Pairing** (`src/modules/companion/`, `src/domain/midi/companion-link.ts`, `scan.ts`). A device pairs once on the Companion page, in the sidebar: a scan of the network, the QR code on the companion's screen, or the address typed by hand. The scan asks `/status` of the 254 addresses of one subnet over plain HTTP, 32 at a time, 1.5 s each, about 12 s in all. A web page cannot read its own address, so the musician types the subnet, `192.168.1` by default, the last one remembered: trying the common subnets in turn would take a minute or more. Only Chrome can scan, after its local network prompt; Safari and Firefox block plain HTTP from the app and do not trust the certificate yet, so there the QR code pairs. From then on the app connects at every launch, tries again after 2, 4, 8 s up to 30 s while the companion does not answer, and shows the state as a dot on the Companion entry: green connected, red lost, grey connecting or disconnected. Disconnect stops the link and keeps the address, Forget clears it. Connected, the page shows the stage computer (name, version, MIDI output and input, Bluetooth, address), every device heard from in the last 15 s (name, part, platform, what it shows with the setlist and song names read from this device's data, follow mode, MIDI transport, channel and last send) and the last 50 batches played with the device that sent them, all kept current by long polls.

**Follow the leader** (`src/modules/performance/hooks/use-follow-leader.ts`). Optional and off by default: a leading device posts its position (setlist, song, slot) to the companion program, following devices wait on it and jump to that song. Local network only; it needs the Wi-Fi transport.

## Companion protocol

HTTP on port 7777, JSON, open to any origin (it is only reachable on the band's own network). POST bodies are sent as `text/plain` so that no CORS preflight delays a song change.

| Request | Result |
|---|---|
| `GET /status` | name, version, seconds since it started (`uptime`), MIDI output and input in use, Bluetooth state, last 20 batches, last answers from the gear |
| `POST /midi` `{"messages":[[176,21,0],[176,20,6]],"from":"keys","device":"<id>"}` | 200 `{"sent":2}`; 400 if malformed; 503 without a MIDI output. `device` is optional and ties the batch to a device of `/devices` |
| `POST /position` `{"from","setlistId","songId","index"}` | 200 `{"seq":n}` |
| `GET /position?after=<seq>&wait=<s>` | 200 `{"seq","position"}` as soon as there is a newer one, else 204 after the wait |
| `GET /feedback?after=<seq>&wait=<s>` | 200 `{"seq","state":[[176,20,22],[176,21,1]]}`, the last value of each control the gear sent back, as soon as newer than `after`, else 204 after the wait |
| `POST /presence` `{"id","name","part","platform","appVersion","page","setlistId"?,"songId"?,"index"?,"follow","midi":{"transport","lastSend","channel"?}}` | 200 `{"seq":n}`; 400 without an `id` and a `name`. Each device sends it every 5 s; the companion keeps one entry per `id`, relayed as it came plus `address` and `lastSeen`, and forgets a device silent for 15 s |
| `GET /devices?after=<seq>&wait=<s>` | 200 `{"seq","now","devices":[...]}` as soon as newer than `after`, else 204 after the wait. Every report, arrival and departure counts as newer |
| `GET /log?after=<seq>&wait=<s>` | 200 `{"seq","now","entries":[{"seq","at","from","device"?,"via","messages"}]}`, the last 50 batches played, newest first, as soon as newer than `after`, else 204 after the wait |
| `GET /` | status page for the person at the computer: the address with a QR code that sets a tablet up, then the stage computer, the devices and the MIDI log, as on the app's Companion page, followed live from `/status`, `/devices` and `/log` |

Times (`at`, `lastSeen`, `now`) are milliseconds since 1970 on the companion's clock: the app compares them with `now`, not with its own clock, since a gig has no internet to set clocks by.

The QR code opens `…/settings?companion=<address>`: the app pairs with that address and shows the Companion page.

## Not verified yet

- Chrome on Android asking for and honouring the local network permission.
- The network scan on Chrome for Android: whether one local network prompt covers the 254 requests, and how long the addresses nobody answers take to fail there.
- The Bluetooth transport end to end: no tablet has connected to the companion yet.
- The companion program at run time on Windows (never started on a real one) and on Linux with a real ALSA sequencer and BlueZ.
- Ableton Live mapping a note per song and echoing anything on the `Open Setlist` output. Tried on 2026-10-20 by the keyboard player with CC 20: Live would not map CC values to anything but one instrument parameter, from the app and from the keyboard alike, hence the switch to notes on 2026-10-21. On 2026-10-19 Live had reported a pitch bend; the companion writes exactly what it receives (`cargo test --test loopback -- --ignored`, macOS), so the pitch bend most likely came from another Remote input, such as the keyboard's wheel. With notes, Live likely echoes nothing on the output, so the MIDI chip would stay blue.
- Whether the drum pad and the pedalboard accept Program Change, and on which channel.
