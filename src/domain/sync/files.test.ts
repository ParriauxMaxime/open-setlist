import type { AppDatabase, Song, SongFile } from "@db";
import type { SongAttachment } from "@db/song";
import { ATTACHMENT_LARGE_BYTES } from "../attachments";
import { createGitHubAdapter } from "./adapters/github";
import { planFileSync, syncFiles } from "./files";
import type { RemoteFilesPort } from "./ports/remote-sync.port";
import { FakeGitHub, makeSong } from "./test-fakes";

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

const realFetch = globalThis.fetch;
let github: FakeGitHub;
let remote: RemoteFilesPort;

beforeEach(() => {
  github = new FakeGitHub();
  github.install();
  const { files } = createGitHubAdapter({
    adapter: "github",
    owner: "band",
    repo: "songs",
    token: "t",
    path: "open-setlist.json",
    lastVersionToken: null,
    lastSyncedAt: null,
  });
  if (!files) throw new Error("The GitHub adapter syncs files");
  remote = files;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

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

describe("syncFiles through GitHub", () => {
  const song = makeSong("s1", 1, { attachments: [attachment(TRUMPET), attachment(SCORE)] });

  it("carries files from one device to another", async () => {
    const alice = device([song], { [TRUMPET]: "%PDF trumpet", [SCORE]: "%PDF score" });
    const bob = device([song]);

    expect(await syncFiles(remote, alice.db)).toEqual({
      uploaded: 2,
      downloaded: 0,
      tooLarge: 0,
      unavailable: 0,
    });
    expect(github.text(`open-setlist-files/${TRUMPET}`)).toBe("%PDF trumpet");

    expect(await syncFiles(remote, bob.db)).toMatchObject({ uploaded: 0, downloaded: 2 });
    expect(await bob.rows.get(TRUMPET)?.data.text()).toBe("%PDF trumpet");
    expect(bob.rows.get(SCORE)?.data.type).toBe("application/pdf");
  });

  it("does nothing the second time", async () => {
    const alice = device([song], { [TRUMPET]: "a", [SCORE]: "b" });
    await syncFiles(remote, alice.db);
    const before = github.requestCount;
    expect(await syncFiles(remote, alice.db)).toMatchObject({ uploaded: 0, downloaded: 0 });
    expect(github.requestCount).toBe(before + 1);
  });

  it("does not call GitHub when no song has sheet music", async () => {
    await syncFiles(remote, device([makeSong("s2", 1)]).db);
    expect(github.requestCount).toBe(0);
  });

  it("reports a file its owner has not sent yet", async () => {
    expect(await syncFiles(remote, device([song]).db)).toMatchObject({ unavailable: 2 });
  });
});
