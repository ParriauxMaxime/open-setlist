import { DEVICE_PLATFORM } from "../device";
import { MIDI_LAST_SEND } from "./companion";
import {
  COMPANION_LINK,
  type CompanionLinkState,
  companionLink,
  nudgeHeartbeat,
  retryDelay,
  runCompanionLink,
  setCompanionLink,
  subscribeCompanionLink,
  waitForNudge,
} from "./companion-link";
import { buildPresence } from "./presence";
import { DEFAULT_MIDI_SETTINGS } from "./settings";

const BASE = "https://192.168.1.20:7777";
const STATUS = { app: "open-setlist-companion", version: "0.4.0", name: "Stage PC", midiOut: "x" };

const presence = () =>
  buildPresence({
    id: "tablet-1",
    partLabel: "Keys",
    platform: DEVICE_PLATFORM.iPad,
    appVersion: "abc1234",
    page: "Catalog",
    settings: DEFAULT_MIDI_SETTINGS,
    stage: {},
    lastSend: MIDI_LAST_SEND.none,
  });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Answers with `answer` until `steps` waits have passed, then stops the link. */
function harness(answer: (url: string) => Response) {
  const abort = new AbortController();
  const urls: string[] = [];
  const states: CompanionLinkState[] = [];
  const waits: number[] = [];
  const unsubscribe = subscribeCompanionLink(() => states.push(companionLink().state));
  const fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input).replace(BASE, ""));
    return answer(String(input));
  }) as typeof globalThis.fetch;
  const run = (steps: number) => {
    const wait = async (ms: number) => {
      waits.push(ms);
      if (waits.length >= steps) abort.abort();
    };
    return runCompanionLink(BASE, {
      signal: abort.signal,
      presence,
      onMoved: () => undefined,
      fetch,
      waitBeat: wait,
      waitRetry: wait,
    }).finally(unsubscribe);
  };
  return { urls, states, waits, run };
}

describe("retryDelay", () => {
  it("doubles from 2 s up to 30 s", () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe("runCompanionLink", () => {
  beforeEach(() => {
    setCompanionLink({ state: COMPANION_LINK.off, base: "", status: null });
  });

  it("connects, then reports this device at each heartbeat", async () => {
    const link = harness((url) => (url.endsWith("/status") ? json(STATUS) : json({ seq: 1 })));
    await link.run(2);
    expect(link.urls).toEqual(["/status", "/presence", "/presence"]);
    expect(link.states).toEqual([COMPANION_LINK.connecting, COMPANION_LINK.connected]);
    expect(link.waits).toEqual([5000, 5000]);
    expect(companionLink().status?.name).toBe("Stage PC");
  });

  it("keeps retrying, further apart, while the companion does not answer", async () => {
    const link = harness(() => {
      throw new TypeError("Failed to fetch");
    });
    await link.run(4);
    expect(link.waits).toEqual([2000, 4000, 8000, 16000]);
    expect(link.states).toEqual([COMPANION_LINK.connecting]);
  });

  it("says lost when a companion that answered stops answering", async () => {
    let up = true;
    const link = harness((url) => {
      if (!up) throw new TypeError("Failed to fetch");
      up = false;
      return url.endsWith("/status") ? json(STATUS) : json({ seq: 1 });
    });
    await link.run(2);
    expect(link.states).toEqual([
      COMPANION_LINK.connecting,
      COMPANION_LINK.connected,
      COMPANION_LINK.lost,
    ]);
    expect(link.waits).toEqual([2000, 4000]);
  });

  it("stays connected to a companion too old to know presence", async () => {
    const link = harness((url) =>
      url.endsWith("/status") ? json(STATUS) : json({ error: "not-found" }, 404),
    );
    await link.run(3);
    expect(link.states).toEqual([COMPANION_LINK.connecting, COMPANION_LINK.connected]);
  });
});

describe("waitForNudge", () => {
  it("ends early when nudged", async () => {
    const started = Date.now();
    const waiting = waitForNudge(10_000, new AbortController().signal);
    nudgeHeartbeat();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
