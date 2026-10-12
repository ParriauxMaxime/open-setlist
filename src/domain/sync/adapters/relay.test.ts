import { MAX_SNAPSHOT_BYTES } from "../../../../worker/relay";
import { MemoryRelay } from "../../../../worker/test-fakes";
import { generateBandCode } from "../band-code";
import type { RelayConfig } from "../config";
import { loadSyncConfig, saveSyncConfig } from "../config";
import { sync } from "../orchestrator";
import { ConflictError } from "../ports/remote-sync.port";
import {
  createMemoryDb,
  installMemoryLocalStorage,
  makeSnapshot,
  makeSong,
  putLocalSong,
} from "../test-fakes";
import {
  createBand,
  createRelayAdapter,
  fetchBandProfile,
  RELAY_ERROR,
  RelayError,
  type RelayOptions,
} from "./relay";

const BAND = { name: "Les Rêveurs du Dimanche", avatar: "\u{1F3B8}" };

function config(code: string): RelayConfig {
  return { adapter: "relay", code, lastVersionToken: null, lastSyncedAt: null };
}

function optionsFor(relay: MemoryRelay): RelayOptions {
  return { relayUrl: relay.url, fetch: relay.fetch };
}

async function setup() {
  const relay = new MemoryRelay();
  const options = optionsFor(relay);
  const code = generateBandCode();
  await createBand(code, BAND, options);
  return { relay, options, code, adapter: createRelayAdapter(config(code), options) };
}

async function expectRelayError(promise: Promise<unknown>, kind: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(RelayError);
  expect((error as RelayError).kind).toBe(kind);
}

describe("create and join", () => {
  it("creates a band that the code alone gives access to", async () => {
    const { options, code, adapter } = await setup();
    expect(await fetchBandProfile(code, options)).toEqual(BAND);
    expect(await adapter.testConnection()).toBe(BAND.name);
  });

  it("does not know a band from a wrong code", async () => {
    const { options } = await setup();
    const wrong = generateBandCode();
    await expectRelayError(fetchBandProfile(wrong, options), RELAY_ERROR.unknownBand);
    await expectRelayError(
      createRelayAdapter(config(wrong), options).pull(),
      RELAY_ERROR.unknownBand,
    );
  });

  it("is refused when the token does not match the band", async () => {
    const { relay, options, code, adapter } = await setup();
    const band = relay.onlyBand.band;
    if (!band) throw new Error("no band");
    band.authHash = "0".repeat(64);
    await expectRelayError(fetchBandProfile(code, options), RELAY_ERROR.rejected);
    await expectRelayError(adapter.pull(), RELAY_ERROR.rejected);
    await expectRelayError(adapter.push(makeSnapshot([]), null), RELAY_ERROR.rejected);
  });

  it("cannot take over an existing band", async () => {
    const { options, code } = await setup();
    await expectRelayError(createBand(code, { name: "Other" }, options), RELAY_ERROR.rejected);
    expect(await fetchBandProfile(code, options)).toEqual(BAND);
  });
});

describe("pull and push", () => {
  it("has nothing to pull before the first push", async () => {
    const { adapter } = await setup();
    expect(await adapter.pull()).toBeNull();
  });

  it("pulls what was pushed, with a new version token each time", async () => {
    const { adapter } = await setup();
    const first = makeSnapshot([makeSong("a", 1, { title: "Été indien" })]);
    const token1 = await adapter.push(first, null);
    expect(await adapter.pull()).toEqual({ snapshot: first, versionToken: token1 });

    const second = makeSnapshot([makeSong("a", 2), makeSong("b", 2)]);
    const token2 = await adapter.push(second, token1);
    expect(token2).not.toBe(token1);
    expect(await adapter.pull()).toEqual({ snapshot: second, versionToken: token2 });
  });

  it("throws ConflictError when the band moved since the pull", async () => {
    const { options, code, adapter } = await setup();
    const other = createRelayAdapter(config(code), options);
    const token = await adapter.push(makeSnapshot([makeSong("a", 1)]), null);
    const theirs = makeSnapshot([makeSong("a", 2)]);
    await other.push(theirs, token);

    await expect(adapter.push(makeSnapshot([makeSong("a", 3)]), token)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(adapter.push(makeSnapshot([makeSong("a", 3)]), null)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await adapter.pull())?.snapshot).toEqual(theirs);
  });

  it("only ever sends ciphertext", async () => {
    const { relay, code, adapter } = await setup();
    await adapter.push(makeSnapshot([makeSong("a", 1, { title: "Secret Song Title" })]), null);

    const store = relay.onlyBand;
    const stored = Buffer.concat([
      Buffer.from(store.read("meta") ?? []),
      Buffer.from(store.read("snapshot") ?? []),
      Buffer.from(JSON.stringify([...relay.bands.keys(), store.band])),
    ]);
    for (const secret of ["Secret Song Title", "Rêveurs", "Line one", code]) {
      expect(stored.includes(Buffer.from(secret))).toBe(false);
    }
  });
});

describe("damaged or hostile relay data", () => {
  it("rejects a tampered snapshot", async () => {
    const { relay, adapter } = await setup();
    await adapter.push(makeSnapshot([makeSong("a", 1)]), null);
    const chunk = relay.onlyBand.blobs.get("snapshot")?.[0];
    if (!chunk) throw new Error("no snapshot");
    chunk[chunk.length - 1] ^= 1;
    await expectRelayError(adapter.pull(), RELAY_ERROR.damaged);
  });

  it("rejects an old snapshot served as the current version", async () => {
    const { relay, adapter } = await setup();
    const token = await adapter.push(makeSnapshot([makeSong("a", 1)]), null);
    const old = relay.onlyBand.blobs.get("snapshot");
    await adapter.push(makeSnapshot([makeSong("a", 2)]), token);
    if (!old) throw new Error("no snapshot");
    relay.onlyBand.blobs.set("snapshot", old);
    await expectRelayError(adapter.pull(), RELAY_ERROR.damaged);
  });

  it("rejects band info swapped for the snapshot", async () => {
    const { relay, options, code, adapter } = await setup();
    await adapter.push(makeSnapshot([makeSong("a", 1)]), null);
    const snapshot = relay.onlyBand.blobs.get("snapshot");
    if (!snapshot) throw new Error("no snapshot");
    relay.onlyBand.blobs.set("meta", snapshot);
    await expectRelayError(fetchBandProfile(code, options), RELAY_ERROR.damaged);
  });
});

describe("failures", () => {
  it("says so when no relay is configured", async () => {
    const code = generateBandCode();
    await expectRelayError(createBand(code, BAND), RELAY_ERROR.notConfigured);
    await expectRelayError(createRelayAdapter(config(code)).pull(), RELAY_ERROR.notConfigured);
  });

  it("reports an unreachable relay", async () => {
    const offline: RelayOptions = {
      relayUrl: "https://relay.test",
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    };
    await expectRelayError(fetchBandProfile(generateBandCode(), offline), RELAY_ERROR.unreachable);
  });

  it("does not mistake another server for the relay", async () => {
    // The worker before the relay was added answers every path like this.
    const proxyOnly: RelayOptions = {
      relayUrl: "https://relay.test",
      fetch: async () => new Response("Missing ?url= parameter", { status: 400 }),
    };
    const code = generateBandCode();
    await expectRelayError(createBand(code, BAND, proxyOnly), RELAY_ERROR.unreachable);
    await expectRelayError(
      createRelayAdapter(config(code), proxyOnly).pull(),
      RELAY_ERROR.unreachable,
    );
  });

  it("reports a band too large for the relay", async () => {
    const { adapter } = await setup();
    // Random bytes do not compress, so the sealed snapshot stays over the limit.
    const noise = Buffer.alloc(MAX_SNAPSHOT_BYTES);
    for (let offset = 0; offset < noise.length; offset += 65536) {
      crypto.getRandomValues(noise.subarray(offset, offset + 65536));
    }
    const huge = makeSnapshot([makeSong("a", 1, { content: noise.toString("base64") })]);
    await expectRelayError(adapter.push(huge, null), RELAY_ERROR.tooLarge);
    expect(await adapter.pull()).toBeNull();
  });
});

describe("two devices through the orchestrator", () => {
  it("shares a catalog and merges edits made on both sides", async () => {
    installMemoryLocalStorage();
    const { options, code } = await setup();
    const alice = { db: createMemoryDb(), profileId: "alice" };
    const bob = { db: createMemoryDb(), profileId: "bob" };
    for (const device of [alice, bob]) saveSyncConfig(device.profileId, config(code));
    const syncDevice = (device: typeof alice) =>
      sync(createRelayAdapter(config(code), options), device.db, device.profileId);

    putLocalSong(alice.db, makeSong("a", 1));
    putLocalSong(alice.db, makeSong("b", 1));
    expect((await syncDevice(alice)).status).toBe("created");
    expect((await syncDevice(bob)).status).toBe("synced");
    expect(await bob.db.songs.count()).toBe(2);

    putLocalSong(alice.db, makeSong("a", 5, { title: "Alice's edit" }));
    putLocalSong(bob.db, makeSong("b", 6, { title: "Bob's edit" }));
    await syncDevice(alice);
    await syncDevice(bob);
    await syncDevice(alice);

    const titles = async (device: typeof alice) =>
      (await device.db.songs.toArray()).map((s) => s.title).sort();
    expect(await titles(alice)).toEqual(["Alice's edit", "Bob's edit"]);
    expect(await titles(bob)).toEqual(["Alice's edit", "Bob's edit"]);
    expect(loadSyncConfig("alice")?.lastVersionToken).toBe(loadSyncConfig("bob")?.lastVersionToken);
  });
});
