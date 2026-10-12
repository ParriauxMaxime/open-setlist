import type { AppDatabase, Song, SongFile } from "@db";
import type { SongAttachment } from "@db/song";
import { MAX_FILE_BYTES } from "../../../worker/relay";
import { MemoryRelay } from "../../../worker/test-fakes";
import { ATTACHMENT_LARGE_BYTES } from "../attachments";
import { createBand, createRelayAdapter, RELAY_ERROR, RelayError } from "./adapters/relay";
import { generateBandCode } from "./band-code";
import { planFileSync, syncFiles } from "./files";
import type { RemoteFilesPort } from "./ports/remote-sync.port";
import { makeSong } from "./test-fakes";

const TRUMPET = "11111111-1111-4111-8111-111111111111";
const SCORE = "22222222-2222-4222-8222-222222222222";

function attachment(id: string, size = 1000): SongAttachment {
  return { id, name: `${id}.pdf`, type: "application/pdf", size };
}

/** A device: its songs and the files it holds. */
function device(songs: Song[], files: Record<string, string> = {}) {
  const rows = new Map<string, SongFile>(
    Object.entries(files).map(([id, text]) => [id, { id, data: new Blob([text]) }]),
  );
  const db = {
    songs: { toArray: async () => songs },
    files: {
      toCollection: () => ({ primaryKeys: async () => Array.from(rows.keys()) }),
      get: async (id: string) => rows.get(id),
      put: async (file: SongFile) => {
        rows.set(file.id, file);
      },
    },
  } as unknown as Pick<AppDatabase, "songs" | "files">;
  return { db, rows };
}

async function band(): Promise<{ relay: MemoryRelay; files: RemoteFilesPort; code: string }> {
  const relay = new MemoryRelay();
  const options = { relayUrl: relay.url, fetch: relay.fetch };
  const code = generateBandCode();
  await createBand(code, { name: "Band" }, options);
  const config = { adapter: "relay" as const, code, lastVersionToken: null, lastSyncedAt: null };
  const { files } = createRelayAdapter(config, options);
  if (!files) throw new Error("The relay adapter syncs files");
  return { relay, files, code };
}

describe("planFileSync", () => {
  it("uploads what the remote lacks and downloads what the device lacks", () => {
    const plan = planFileSync(
      [attachment("a"), attachment("b"), attachment("c")],
      ["a", "c"],
      ["b", "c"],
    );
    expect(plan.upload.map((a) => a.id)).toEqual(["a"]);
    expect(plan.download.map((a) => a.id)).toEqual(["b"]);
    expect(plan.unavailable).toEqual([]);
  });

  it("reports files that are nowhere yet, and local files too large to send", () => {
    const plan = planFileSync(
      [attachment("lost"), attachment("huge", ATTACHMENT_LARGE_BYTES + 1)],
      ["huge"],
      [],
    );
    expect(plan.unavailable.map((a) => a.id)).toEqual(["lost"]);
    expect(plan.tooLarge.map((a) => a.id)).toEqual(["huge"]);
    expect(plan.upload).toEqual([]);
  });

  it("counts a file shared by two songs once, and ignores unreferenced files", () => {
    const plan = planFileSync([attachment("a"), attachment("a")], ["a", "orphan"], ["old"]);
    expect(plan.upload.map((a) => a.id)).toEqual(["a"]);
    expect(plan.download).toEqual([]);
  });
});

describe("syncFiles through the relay", () => {
  const song = makeSong("s1", 1, { attachments: [attachment(TRUMPET), attachment(SCORE)] });

  it("carries files from one device to another, encrypted on the relay", async () => {
    const { relay, files } = await band();
    const alice = device([song], { [TRUMPET]: "%PDF trumpet", [SCORE]: "%PDF score" });
    const bob = device([song]);

    expect(await syncFiles(files, alice.db)).toEqual({
      uploaded: 2,
      downloaded: 0,
      tooLarge: 0,
      unavailable: 0,
    });
    const stored = relay.onlyBand.read(`file:${TRUMPET}`);
    expect(new TextDecoder().decode(stored ?? new Uint8Array())).not.toContain("trumpet");

    expect(await syncFiles(files, bob.db)).toMatchObject({ uploaded: 0, downloaded: 2 });
    expect(await bob.rows.get(TRUMPET)?.data.text()).toBe("%PDF trumpet");
    expect(bob.rows.get(SCORE)?.data.type).toBe("application/pdf");
  });

  it("does nothing the second time", async () => {
    const { relay, files } = await band();
    const alice = device([song], { [TRUMPET]: "a", [SCORE]: "b" });
    await syncFiles(files, alice.db);
    const before = relay.requestCount;
    expect(await syncFiles(files, alice.db)).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(relay.requestCount).toBe(before + 1);
  });

  it("does not call the relay when no song has sheet music", async () => {
    const { relay, files } = await band();
    const before = relay.requestCount;
    await syncFiles(files, device([makeSong("s2", 1)]).db);
    expect(relay.requestCount).toBe(before);
  });

  it("reports a file its owner has not sent yet", async () => {
    const { files } = await band();
    expect(await syncFiles(files, device([song]).db)).toMatchObject({ unavailable: 2 });
  });

  it("never replaces a file already stored under an id", async () => {
    const { files } = await band();
    await files.put(TRUMPET, new Blob(["first"]));
    await files.put(TRUMPET, new Blob(["second"]));
    expect(await (await files.get(TRUMPET))?.text()).toBe("first");
  });

  it("refuses a file served under another file's id", async () => {
    const { relay, files } = await band();
    await files.put(TRUMPET, new Blob(["trumpet"]));
    const sealed = relay.onlyBand.read(`file:${TRUMPET}`);
    if (!sealed) throw new Error("File not stored");
    relay.onlyBand.writeFile(SCORE, sealed);
    const error = await files.get(SCORE).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RelayError);
    expect((error as RelayError).kind).toBe(RELAY_ERROR.damaged);
  });

  it("is refused by the relay over the size limit, and without the band code", async () => {
    const { relay, files } = await band();
    const tooLarge = await files
      .put(TRUMPET, new Blob([new Uint8Array(MAX_FILE_BYTES + 1)]))
      .catch((err: unknown) => err);
    expect((tooLarge as RelayError).kind).toBe(RELAY_ERROR.tooLarge);

    await files.put(SCORE, new Blob(["score"]));
    const bandId = Array.from(relay.bands.keys())[0];
    const stranger = await relay.fetch(`${relay.url}/bands/${bandId}/files/${SCORE}`, {
      headers: { Authorization: "Bearer guess" },
    });
    expect(stranger.status).toBe(403);
    const list = await relay.fetch(`${relay.url}/bands/${bandId}/files`, {
      headers: { Authorization: "Bearer guess" },
    });
    expect(list.status).toBe(403);
  });
});
