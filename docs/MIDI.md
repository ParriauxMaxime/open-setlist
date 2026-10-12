# MIDI on stage

When a musician changes song in performance mode, their device can make their own gear change sound. Everything is opt-in per device and nothing goes through the internet: a gig has no connection, and the project runs no server for it.

## What is sent

Each song has one **sound code** per instrument (`src/domain/midi/patch.ts`):

- **Keyboard**: read from the chart's setup line, the first comment (`{comment:17A🎸}`). The band's synth has three rows of buttons: two digits 1 to 8 and a letter A to D, so 8 × 8 × 4 = 256 sounds. A code in the song's own field wins over the chart.
- **Other instruments**: a field per instrument on the song (editor → Sounds), stored in `Song.patches`. Usually a plain preset number.

A device sends only the code of its own instrument (Settings → Stage: MIDI → My instrument), on its own MIDI channel, so several musicians can send to the same computer:

| Instrument | Default channel | Default message |
|---|---|---|
| Keys | 1 | Two Control Changes: CC 21 = letter (0 to 3), CC 20 = digits (0 to 63). A plain number goes out as CC 20 alone. |
| Guitar, bass, vocals | 2, 3, 4 | Program Change (preset 1 = program 0), preceded by Bank Select (CC 0) when the code has a letter |
| Drums | 10 | same |
| Others | 5 | same |

Channel, message type and CC numbers can be changed per device (MIDI details).

Two Control Changes for the keyboard because Ableton Live maps notes and CC but not Program Change, and one CC cannot carry 256 values. In Live: one Instrument Rack whose chain selector is driven by CC 20 (a chain per digits pair), nested in a rack whose chain selector is driven by CC 21 (a chain per letter). The "Try it" buttons in the settings send each CC alone, which is what Live's MIDI Map mode needs.

Layers inside a sound (strings on top of the piano) are not Open Setlist's job: the synth sends those to Ableton itself.

## How it gets there

```
Tablet ── Wi-Fi (band router, no internet) ──▶ companion program ──▶ virtual MIDI port ──▶ Ableton
Tablet ── Bluetooth MIDI ────────────────────▶ on the stage computer ─▶ hardware by cable
Tablet ── Bluetooth MIDI ────────────────────▶ any BLE MIDI device
```

**Wi-Fi** (`src/domain/midi/companion.ts`). The companion program (`companion/`, one file to run on Windows, macOS or Linux, see its README) listens on port 7777 of the stage computer. On macOS and Linux it creates a MIDI port named `Open Setlist`; Windows cannot do that, so it uses a loopMIDI port of that name. The app is served over HTTPS and the companion speaks plain HTTP on a private address; Chrome allows that after asking the musician once (Local Network Access). Verified in Chrome 155 on a computer: with the permission, `https://…github.io` reaches `http://192.168.x.x:7777`, loopback and `.local` names; without it the request is blocked. Safari and Firefox block it outright, so there is no Wi-Fi transport on an iPad.

**Bluetooth** (`src/domain/midi/bluetooth.ts`). The app is a standard BLE MIDI central through Web Bluetooth (Chrome and Edge, Android and desktop). It connects to the companion program, which advertises as a BLE MIDI device, or straight to BLE MIDI hardware. The browser forgets the device when the page reloads: one tap on the MIDI chip reconnects.

**Follow the leader** (`src/modules/performance/hooks/use-follow-leader.ts`). Optional and off by default: a leading device posts its position (setlist, song, slot) to the companion program, following devices wait on it and jump to that song. Local network only; it needs the Wi-Fi transport.

## Companion protocol

HTTP on port 7777, JSON, open to any origin (it is only reachable on the band's own network). POST bodies are sent as `text/plain` so that no CORS preflight delays a song change.

| Request | Result |
|---|---|
| `GET /status` | name, version, MIDI output in use, Bluetooth state, last messages |
| `POST /midi` `{"messages":[[176,21,0],[176,20,6]],"from":"keys"}` | 200 `{"sent":2}`; 400 if malformed; 503 without a MIDI output |
| `POST /position` `{"from","setlistId","songId","index"}` | 200 `{"seq":n}` |
| `GET /position?after=<seq>&wait=<s>` | 200 `{"seq","position"}` as soon as there is a newer one, else 204 after the wait |
| `GET /` | status page for the person at the computer, with a QR code that sets a tablet up |

The QR code opens `…/settings?companion=<address>`: the app stores the address and shows the MIDI settings.

## Not verified yet

- Chrome on Android asking for and honouring the local network permission.
- The Bluetooth transport end to end: no tablet has connected to the companion yet.
- The companion program at run time on Windows (never started on a real one) and on Linux with a real ALSA sequencer and BlueZ.
- Ableton Live receiving the two Control Changes and switching chains.
- Whether the drum pad and the pedalboard accept Program Change, and on which channel.
