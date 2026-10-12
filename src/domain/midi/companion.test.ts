import { installMemoryLocalStorage } from "../sync/test-fakes";
import {
  COMPANION_ERROR,
  CompanionError,
  companionStatus,
  followIndex,
  postPosition,
  sendToCompanion,
  waitPosition,
} from "./companion";
import { MIDI_ENCODING } from "./patch";
import {
  DEFAULT_MIDI_SETTINGS,
  displayCompanionAddress,
  loadMidiSettings,
  normalizeCompanionAddress,
  patchEncoding,
  saveMidiSettings,
} from "./settings";

const BASE = "http://192.168.1.20:7777";
const STATUS = {
  app: "open-setlist-companion",
  version: "0.1.0",
  name: "Stage PC",
  midiOut: "Open Setlist",
  bluetooth: "advertising",
  sent: 0,
  recent: [],
};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return reply(call);
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function errorKind(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(CompanionError);
  return (error as CompanionError).kind;
}

describe("companion client", () => {
  it("reads the status of the program", async () => {
    const { calls, fetch } = fakeFetch(() => json(STATUS));
    expect(await companionStatus(BASE, { fetch })).toMatchObject({
      name: "Stage PC",
      midiOut: "Open Setlist",
    });
    expect(calls[0].url).toBe(`${BASE}/status`);
  });

  it("does not take another web server for the companion", async () => {
    const router = fakeFetch(() => new Response("<html>Router admin</html>"));
    expect(await errorKind(companionStatus(BASE, { fetch: router.fetch }))).toBe(
      COMPANION_ERROR.unreachable,
    );
    const other = fakeFetch(() => json({ app: "something-else" }));
    expect(await errorKind(companionStatus(BASE, { fetch: other.fetch }))).toBe(
      COMPANION_ERROR.unreachable,
    );
  });

  it("reports a program that cannot be reached", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    expect(await errorKind(companionStatus(BASE, { fetch }))).toBe(COMPANION_ERROR.unreachable);
    expect(await errorKind(sendToCompanion(BASE, [[0xc0, 1]], "keys", { fetch }))).toBe(
      COMPANION_ERROR.unreachable,
    );
  });

  it("posts MIDI without a CORS preflight", async () => {
    const { calls, fetch } = fakeFetch(() => json({ sent: 2 }));
    await sendToCompanion(
      BASE,
      [
        [0xb0, 21, 0],
        [0xb0, 20, 6],
      ],
      "keys",
      { fetch },
    );
    expect(calls[0].url).toBe(`${BASE}/midi`);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toEqual({ "Content-Type": "text/plain" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      messages: [
        [0xb0, 21, 0],
        [0xb0, 20, 6],
      ],
      from: "keys",
    });
  });

  it("tells a missing MIDI output from a refused message", async () => {
    const noOutput = fakeFetch(() => json({ error: "no-midi-output" }, 503));
    expect(await errorKind(sendToCompanion(BASE, [[0xc0, 1]], "", { fetch: noOutput.fetch }))).toBe(
      COMPANION_ERROR.noMidiOutput,
    );
    const bad = fakeFetch(() => json({ error: "bad-request" }, 400));
    expect(await errorKind(sendToCompanion(BASE, [[0xc0, 1]], "", { fetch: bad.fetch }))).toBe(
      COMPANION_ERROR.rejected,
    );
  });

  it("publishes and waits for the leader's position", async () => {
    const position = { from: "a", setlistId: "gig", songId: "s3", index: 2 };
    const { calls, fetch } = fakeFetch(({ url }) =>
      url.includes("after=4") ? new Response(null, { status: 204 }) : json({ seq: 4, position }),
    );
    await postPosition(BASE, position, { fetch });
    expect(JSON.parse(String(calls[0].init.body))).toEqual(position);

    expect(await waitPosition(BASE, 0, { fetch })).toEqual({ seq: 4, position });
    expect(calls[1].url).toBe(`${BASE}/position?after=0&wait=25`);
    expect(await waitPosition(BASE, 4, { fetch })).toBeNull();
  });

  it("stops waiting when the page moves on", async () => {
    const abort = new AbortController();
    const fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")));
      })) as unknown as typeof globalThis.fetch;
    const waiting = waitPosition(BASE, 0, { fetch, signal: abort.signal });
    abort.abort();
    const error = await waiting.catch((err: unknown) => err);
    expect(error).not.toBeInstanceOf(CompanionError);
  });
});

describe("followIndex", () => {
  const songs = ["intro", "ballad", "rocker", "ballad"];

  it("goes to the leader's slot when it holds the same song", () => {
    expect(followIndex({ setlistId: "gig", songId: "ballad", index: 3 }, "gig", songs)).toBe(3);
  });

  it("finds the song when this device's copy of the setlist is ordered differently", () => {
    expect(followIndex({ setlistId: "gig", songId: "rocker", index: 0 }, "gig", songs)).toBe(2);
  });

  it("stays put for another setlist or a song this device does not have", () => {
    expect(followIndex({ setlistId: "other", songId: "intro", index: 0 }, "gig", songs)).toBeNull();
    expect(followIndex({ setlistId: "gig", songId: "new", index: 1 }, "gig", songs)).toBeNull();
  });
});

describe("companion address", () => {
  it("accepts what a musician types or scans", () => {
    expect(normalizeCompanionAddress("192.168.1.20")).toBe(BASE);
    expect(normalizeCompanionAddress(" 192.168.1.20:7777 ")).toBe(BASE);
    expect(normalizeCompanionAddress("http://192.168.1.20:7777/")).toBe(BASE);
    expect(normalizeCompanionAddress("Stage-PC.local:8080")).toBe("http://stage-pc.local:8080");
  });

  it("refuses what is not an address", () => {
    for (const input of ["", "le pc", "192.168.1.20:99999", "192.168.1.20:0", "pc:abc", "-pc"]) {
      expect(normalizeCompanionAddress(input)).toBeNull();
    }
  });

  it("shows it back without the default port", () => {
    expect(displayCompanionAddress(BASE)).toBe("192.168.1.20");
    expect(displayCompanionAddress("http://stage-pc.local:8080")).toBe("stage-pc.local:8080");
    expect(displayCompanionAddress("")).toBe("");
  });
});

describe("MIDI settings", () => {
  beforeEach(installMemoryLocalStorage);

  it("has everything off until the musician turns it on", () => {
    expect(loadMidiSettings()).toEqual(DEFAULT_MIDI_SETTINGS);
    expect(DEFAULT_MIDI_SETTINGS).toMatchObject({ enabled: false, follow: "off", companion: "" });
  });

  it("remembers changes and ignores a half-typed number", () => {
    saveMidiSettings({ enabled: true, role: "keys", companion: BASE });
    expect(loadMidiSettings()).toMatchObject({ enabled: true, role: "keys", companion: BASE });
    saveMidiSettings({ channel: 99 });
    saveMidiSettings({ ccSlot: Number.NaN });
    expect(loadMidiSettings()).toMatchObject({ enabled: true, ccSlot: 20 });
    expect(loadMidiSettings().channel).toBeUndefined();
  });

  it("falls back to defaults on unreadable stored data", () => {
    localStorage.setItem("open-setlist-midi", "{not json");
    expect(loadMidiSettings()).toEqual(DEFAULT_MIDI_SETTINGS);
  });

  it("derives channel and message type from the role unless set", () => {
    expect(patchEncoding({ ...DEFAULT_MIDI_SETTINGS, role: "keys" })).toMatchObject({
      channel: 1,
      encoding: MIDI_ENCODING.ccPair,
    });
    expect(patchEncoding({ ...DEFAULT_MIDI_SETTINGS, role: "drums" })).toMatchObject({
      channel: 10,
      encoding: MIDI_ENCODING.program,
    });
    expect(
      patchEncoding({ ...DEFAULT_MIDI_SETTINGS, role: "drums", channel: 4, encoding: "cc-pair" }),
    ).toMatchObject({ channel: 4, encoding: MIDI_ENCODING.ccPair });
  });
});
