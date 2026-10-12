// In-memory relay for tests (Jest, node environment). Not deployed.
import {
  type BandStore,
  type BlobKey,
  handleBandRequest,
  handleRelayRequest,
  joinChunks,
  splitChunks,
} from "./relay";

export class MemoryBandStore implements BandStore {
  band: { authHash: string; version: number } | null = null;
  blobs = new Map<BlobKey, Uint8Array<ArrayBuffer>[]>();

  load() {
    return this.band ? { ...this.band } : null;
  }

  create(authHash: string, meta: Uint8Array): void {
    this.band = { authHash, version: 0 };
    this.blobs.set("meta", splitChunks(meta));
  }

  read(key: BlobKey): Uint8Array<ArrayBuffer> | null {
    const chunks = this.blobs.get(key);
    return chunks ? joinChunks(chunks) : null;
  }

  writeSnapshot(data: Uint8Array, version: number): void {
    if (!this.band) throw new Error("Band not created");
    this.blobs.set("snapshot", splitChunks(data));
    this.band.version = version;
  }
}

/** The whole worker side: one store per band id, as Durable Objects give. */
export class MemoryRelay {
  readonly url = "https://relay.test";
  bands = new Map<string, MemoryBandStore>();
  allowedOrigins: string[] = [];
  requestCount = 0;

  store(bandId: string): MemoryBandStore {
    let store = this.bands.get(bandId);
    if (!store) {
      store = new MemoryBandStore();
      this.bands.set(bandId, store);
    }
    return store;
  }

  /** The only band of a test. */
  get onlyBand(): MemoryBandStore {
    const [store, ...others] = Array.from(this.bands.values()).filter((s) => s.band);
    if (!store || others.length > 0) throw new Error("Expected exactly one band");
    return store;
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    this.requestCount++;
    return handleRelayRequest(new Request(input, init), this.allowedOrigins, (bandId, request) =>
      handleBandRequest(request, this.store(bandId)),
    );
  };
}
