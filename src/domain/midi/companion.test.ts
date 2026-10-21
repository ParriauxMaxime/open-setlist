import { installMemoryLocalStorage } from "../sync/test-fakes";
import {
  awaitConfirmation,
  COMPANION_ERROR,
  CompanionError,
  companionStatus,
  confirms,
  followIndex,
  postPosition,
  postPresence,
  probeCompanion,
  sendToCompanion,
  waitDevices,
  waitFeedback,
  waitLog,
  waitPosition,
} from "./companion";
import { MIDI_ENCODING } from "./patch";
import {
  DEFAULT_MIDI_SETTINGS,
  displayCompanionAddress,
  loadMidiSettings,
  normalizeCompanionAddress,
  otherScheme,
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
    expect(await errorKind(sendToCompanion(BASE, [[0xc0, 1]], { from: "keys" }, { fetch }))).toBe(
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
      { from: "keys", device: "tablet-1" },
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
      device: "tablet-1",
    });
  });

  it("tells a missing MIDI output from a refused message", async () => {
    const noOutput = fakeFetch(() => json({ error: "no-midi-output" }, 503));
    const sender = { from: "" };
    expect(
      await errorKind(sendToCompanion(BASE, [[0xc0, 1]], sender, { fetch: noOutput.fetch })),
    ).toBe(COMPANION_ERROR.noMidiOutput);
    const bad = fakeFetch(() => json({ error: "bad-request" }, 400));
    expect(await errorKind(sendToCompanion(BASE, [[0xc0, 1]], sender, { fetch: bad.fetch }))).toBe(
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

  it("reports this device and reads the devices the companion knows", async () => {
    const presence = {
      id: "tablet-1",
      name: "Keys · iPad",
      part: "keys",
      platform: "iPad",
      appVersion: "abc1234",
      page: "Perform",
      setlistId: "gig",
      songId: "s3",
      index: 2,
      follow: "lead",
      midi: { transport: "wifi", lastSend: "ok", channel: 15 },
    } as const;
    const seen = { ...presence, address: "192.168.1.31", lastSeen: 1000 };
    const { calls, fetch } = fakeFetch(({ url }) =>
      url.endsWith("/presence")
        ? json({ seq: 7 })
        : json({ seq: 7, now: 1500, devices: [seen, { id: "old", name: "Bass" }, { name: "?" }] }),
    );
    expect(await postPresence(BASE, presence, { fetch })).toBe(7);
    expect(calls[0].init.headers).toEqual({ "Content-Type": "text/plain" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual(presence);

    const reply = await waitDevices(BASE, 0, { fetch }, 0);
    expect(calls[1].url).toBe(`${BASE}/devices?after=0&wait=0`);
    expect(reply?.now).toBe(1500);
    // A device from an older app is kept with blanks; one without an id is dropped
    expect(reply?.devices).toEqual([
      seen,
      {
        id: "old",
        name: "Bass",
        part: "",
        platform: "",
        appVersion: "",
        page: "",
        follow: "off",
        midi: { transport: "off", lastSend: "none" },
        address: null,
        lastSeen: 0,
      },
    ]);
  });

  it("reads the MIDI log, newest first, and nothing when it did not change", async () => {
    const entry = {
      seq: 2,
      at: 1000,
      from: "keys",
      device: "tablet-1",
      via: "wifi",
      messages: [[0x9e, 111, 100]],
    };
    const { calls, fetch } = fakeFetch(({ url }) =>
      url.includes("after=2")
        ? new Response(null, { status: 204 })
        : json({ seq: 2, now: 1200, entries: [entry] }),
    );
    expect(await waitLog(BASE, 0, { fetch })).toEqual({ seq: 2, now: 1200, entries: [entry] });
    expect(calls[0].url).toBe(`${BASE}/log?after=0&wait=25`);
    expect(await waitLog(BASE, 2, { fetch })).toBeNull();
  });

  it("tells an older companion without presence apart", async () => {
    const { fetch } = fakeFetch(() => json({ error: "not-found" }, 404));
    const presence = {
      id: "t",
      name: "n",
      part: "",
      platform: "Mac",
      appVersion: "",
      page: "Catalog",
      follow: "off",
      midi: { transport: "off", lastSend: "none" },
    } as const;
    expect(await errorKind(postPresence(BASE, presence, { fetch }))).toBe(COMPANION_ERROR.rejected);
  });

  it("waits for the gear's answers and checks the sent messages are among them", async () => {
    const sent = [
      [0xb0, 21, 1],
      [0xb0, 20, 22],
    ];
    // Nothing yet, then the letter alone, then both: the gear answers one control at a time
    const answers = [
      new Response(null, { status: 204 }),
      json({ seq: 1, state: [[0xb0, 21, 1]] }),
      json({
        seq: 2,
        state: [
          [0xb0, 20, 22],
          [0xb0, 21, 1],
        ],
      }),
    ];
    const { calls, fetch } = fakeFetch(
      () => answers.shift() ?? new Response(null, { status: 204 }),
    );

    expect(await waitFeedback(BASE, 0, { fetch })).toBeNull();
    expect(calls[0].url).toBe(`${BASE}/feedback?after=0&wait=5`);
    expect(await waitFeedback(BASE, 0, { fetch })).toEqual({ seq: 1, state: [[0xb0, 21, 1]] });

    expect(
      confirms(
        [
          [0xb0, 20, 22],
          [0xb0, 21, 1],
        ],
        sent,
      ),
    ).toBe(true);
    expect(
      confirms(
        [
          [0xb0, 20, 22],
          [0xb0, 21, 2],
        ],
        sent,
      ),
    ).toBe(false);
    expect(
      confirms(
        [
          [0xb0, 20, 22],
          [0xb0, 21, 1],
        ],
        [],
      ),
    ).toBe(false);

    await awaitConfirmation(BASE, sent, { fetch });
    expect(calls.map((call) => call.url.replace(BASE, ""))).toEqual([
      "/feedback?after=0&wait=5",
      "/feedback?after=0&wait=5",
      "/feedback?after=0&wait=5",
    ]);
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

  it("does not count a confirmation that never came when the wait is given up", async () => {
    const abort = new AbortController();
    const { fetch } = fakeFetch(() => {
      abort.abort();
      return new Response(null, { status: 204 });
    });
    const error = await awaitConfirmation(BASE, [[0xb0, 20, 1]], {
      fetch,
      signal: abort.signal,
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(DOMException);
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

describe("probeCompanion", () => {
  const only = (scheme: string) =>
    fakeFetch(({ url }) => {
      if (!url.startsWith(`${scheme}://`)) throw new TypeError("blocked");
      return json(STATUS);
    });

  it("keeps the scheme that answers first", async () => {
    const { calls, fetch } = only("https");
    const found = await probeCompanion("https://192.168.1.20:7777", { fetch });
    expect(found.base).toBe("https://192.168.1.20:7777");
    expect(found.status.name).toBe("Stage PC");
    expect(calls).toHaveLength(1);
  });

  it("falls back to the other scheme, as Chrome needs plain HTTP and Firefox HTTPS", async () => {
    const { calls, fetch } = only("http");
    const found = await probeCompanion("https://192.168.1.20:7777", { fetch });
    expect(found.base).toBe(BASE);
    expect(calls.map((call) => call.url)).toEqual([
      "https://192.168.1.20:7777/status",
      "http://192.168.1.20:7777/status",
    ]);
  });

  it("reports the companion unreachable when neither scheme answers", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("blocked");
    });
    expect(await errorKind(probeCompanion(BASE, { fetch }))).toBe(COMPANION_ERROR.unreachable);
  });
});

describe("companion address", () => {
  it("accepts what a musician types or scans, over HTTPS unless told otherwise", () => {
    expect(normalizeCompanionAddress("192.168.1.20")).toBe("https://192.168.1.20:7777");
    expect(normalizeCompanionAddress(" 192.168.1.20:7777 ")).toBe("https://192.168.1.20:7777");
    expect(normalizeCompanionAddress("http://192.168.1.20:7777/")).toBe(BASE);
    expect(normalizeCompanionAddress("https://192.168.1.20/")).toBe("https://192.168.1.20:7777");
    expect(normalizeCompanionAddress("Stage-PC.local:8080")).toBe("https://stage-pc.local:8080");
  });

  it("names the same companion over the other scheme", () => {
    expect(otherScheme(BASE)).toBe("https://192.168.1.20:7777");
    expect(otherScheme("https://192.168.1.20:7777")).toBe(BASE);
  });

  it("refuses what is not an address", () => {
    for (const input of ["", "le pc", "192.168.1.20:99999", "192.168.1.20:0", "pc:abc", "-pc"]) {
      expect(normalizeCompanionAddress(input)).toBeNull();
    }
  });

  it("shows it back without the default port", () => {
    expect(displayCompanionAddress(BASE)).toBe("192.168.1.20");
    expect(displayCompanionAddress("https://192.168.1.20:7777")).toBe("192.168.1.20");
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
    saveMidiSettings({ cc: Number.NaN });
    expect(loadMidiSettings()).toMatchObject({ enabled: true, cc: 20 });
    expect(loadMidiSettings().channel).toBeUndefined();
  });

  it("falls back to defaults on unreadable stored data", () => {
    localStorage.setItem("open-setlist-midi", "{not json");
    expect(loadMidiSettings()).toEqual(DEFAULT_MIDI_SETTINGS);
  });

  it("keeps the rest of the settings when the stored message type no longer exists", () => {
    localStorage.setItem(
      "open-setlist-midi",
      JSON.stringify({ enabled: true, role: "keys", channel: 16, encoding: "cc-pair", ccSlot: 20 }),
    );
    const settings = loadMidiSettings();
    expect(settings).toMatchObject({ enabled: true, channel: 16, cc: 20 });
    expect(patchEncoding(settings).encoding).toBe(MIDI_ENCODING.note);
  });

  it("derives channel and message type from the role unless set", () => {
    expect(patchEncoding({ ...DEFAULT_MIDI_SETTINGS, role: "keys" })).toMatchObject({
      channel: 15,
      encoding: MIDI_ENCODING.note,
    });
    expect(patchEncoding({ ...DEFAULT_MIDI_SETTINGS, role: "drums" })).toMatchObject({
      channel: 10,
      encoding: MIDI_ENCODING.program,
    });
    expect(
      patchEncoding({ ...DEFAULT_MIDI_SETTINGS, role: "drums", channel: 4, encoding: "cc" }),
    ).toMatchObject({ channel: 4, encoding: MIDI_ENCODING.controlChange });
  });
});
