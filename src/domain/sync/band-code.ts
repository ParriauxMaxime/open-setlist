// Band code: the single secret a band shares for simple sync. The band id, the
// relay access token and the encryption key are all derived from it on the
// device, so the relay only ever sees a derived id, a derived token and ciphertext.

// Crockford base32: no I, L, O or U, so a code survives being read or typed.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 28 symbols of 5 bits: 140 bits of entropy. */
export const BAND_CODE_LENGTH = 28;
const GROUP_SIZE = 4;

const KDF_SALT = "open-setlist/band/v1";
const IV_BYTES = 12;
/** Blob layout: format byte, IV, AES-256-GCM ciphertext of the gzipped content. */
const FORMAT_GZIP_AES_GCM = 1;
/** Same layout without gzip, for files: PDFs and images are already compressed. */
const FORMAT_AES_GCM = 2;

export type BandBlobKind = "meta" | "snapshot" | "live" | `file:${string}`;

export interface BandKeys {
  /** 128-bit id naming the band on the relay. */
  bandId: string;
  /** Proves to the relay that this device holds the code. */
  authToken: string;
  key: CryptoKey;
}

export class BandBlobError extends Error {
  constructor() {
    super("Band data cannot be decrypted");
    this.name = "BandBlobError";
  }
}

export function generateBandCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BAND_CODE_LENGTH));
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
}

/** Canonical code, or null. Case, spaces and dashes are ignored; O, I and L read as 0, 1, 1. */
export function normalizeBandCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s\-_.]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (code.length !== BAND_CODE_LENGTH) return null;
  for (const char of code) {
    if (!ALPHABET.includes(char)) return null;
  }
  return code;
}

/** e.g. "K7QM-9XTD-…", for display. */
export function formatBandCode(code: string): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += GROUP_SIZE) groups.push(code.slice(i, i + GROUP_SIZE));
  return groups.join("-");
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deriveBandKeys(code: string): Promise<BandKeys> {
  const material = await crypto.subtle.importKey("raw", utf8(code), "HKDF", false, [
    "deriveBits",
    "deriveKey",
  ]);
  const params = (info: string) => ({
    name: "HKDF",
    hash: "SHA-256",
    salt: utf8(KDF_SALT),
    info: utf8(info),
  });
  const [bandId, authToken, key] = await Promise.all([
    crypto.subtle.deriveBits(params("band-id"), material, 128),
    crypto.subtle.deriveBits(params("auth"), material, 256),
    crypto.subtle.deriveKey(
      params("encryption"),
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    ),
  ]);
  return { bandId: toHex(bandId), authToken: toHex(authToken), key };
}

async function transform(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const piped = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

// Bound as additional data: a blob only opens as the kind and version it was written for,
// so the relay cannot swap blobs or serve an old snapshot under a newer version.
function blobContext(keys: BandKeys, kind: BandBlobKind, version: number): Uint8Array<ArrayBuffer> {
  return utf8(`${KDF_SALT}:${keys.bandId}:${kind}:${version}`);
}

async function seal(
  keys: BandKeys,
  kind: BandBlobKind,
  version: number,
  format: number,
  content: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: blobContext(keys, kind, version) },
    keys.key,
    content,
  );
  const sealed = new Uint8Array(1 + IV_BYTES + ciphertext.byteLength);
  sealed[0] = format;
  sealed.set(iv, 1);
  sealed.set(new Uint8Array(ciphertext), 1 + IV_BYTES);
  return sealed;
}

async function open(
  keys: BandKeys,
  kind: BandBlobKind,
  version: number,
  format: number,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (sealed[0] !== format) throw new Error("Unknown format");
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: sealed.slice(1, 1 + IV_BYTES),
      additionalData: blobContext(keys, kind, version),
    },
    keys.key,
    sealed.slice(1 + IV_BYTES),
  );
  return new Uint8Array(plaintext);
}

export async function sealBlob(
  keys: BandKeys,
  kind: BandBlobKind,
  version: number,
  content: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const gzipped = await transform(utf8(content), new CompressionStream("gzip"));
  return seal(keys, kind, version, FORMAT_GZIP_AES_GCM, gzipped);
}

/** A file is bound to its id: the relay cannot serve one file in place of another. */
export function sealFile(
  keys: BandKeys,
  fileId: string,
  content: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return seal(keys, `file:${fileId}`, 0, FORMAT_AES_GCM, content);
}

/** Throws `BandBlobError` on a wrong code, a tampered file or another file's bytes. */
export async function openFile(
  keys: BandKeys,
  fileId: string,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await open(keys, `file:${fileId}`, 0, FORMAT_AES_GCM, sealed);
  } catch {
    throw new BandBlobError();
  }
}

/** Throws `BandBlobError` on a wrong code, a tampered blob or a kind/version mismatch. */
export async function openBlob(
  keys: BandKeys,
  kind: BandBlobKind,
  version: number,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<string> {
  try {
    const gzipped = await open(keys, kind, version, FORMAT_GZIP_AES_GCM, sealed);
    const content = await transform(gzipped, new DecompressionStream("gzip"));
    return new TextDecoder().decode(content);
  } catch {
    throw new BandBlobError();
  }
}
