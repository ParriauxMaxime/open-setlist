import {
  applyInvite,
  encodeOpenInvite,
  exposesToken,
  INVITE_KDF_ITERATIONS,
  InvitePassphraseError,
  type InvitePayload,
  openSealedInvite,
  parseInvite,
  sealInvite,
} from "./invite";
import { generatePassphrase, normalizePassphrase, PASSPHRASE_WORDS } from "./invite-passphrase";

// Fine-grained PATs are "github_pat_" + 82 chars.
const TOKEN = `github_pat_${"A1b2C3d4E5".repeat(8)}xy`;

const githubPayload: InvitePayload = {
  profile: { name: "Les Rêveurs du Dimanche", avatar: "\u{1F3B8}" },
  sync: { adapter: "github", owner: "band", repo: "setlists", token: TOKEN, path: "setlist.json" },
};

const PASSPHRASE = "lune-tigre-piano-47";

/** The pre-encryption encoder, kept verbatim to build legacy links. */
function legacyEncode(payload: unknown): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(part: string): string {
  let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return atob(b64);
}

function sealedOrFail(encoded: string): string {
  const parsed = parseInvite(encoded);
  if (parsed?.kind !== "encrypted") throw new Error(`expected encrypted, got ${parsed?.kind}`);
  return parsed.sealed;
}

describe("encrypted invites", () => {
  it("uses at least 210k PBKDF2 iterations", () => {
    expect(INVITE_KDF_ITERATIONS).toBeGreaterThanOrEqual(210_000);
  });

  it("round-trips through seal, parse and open", async () => {
    const encoded = await sealInvite(githubPayload, PASSPHRASE);
    const payload = await openSealedInvite(sealedOrFail(encoded), PASSPHRASE);
    expect(payload).toEqual(githubPayload);
  });

  it("never carries the token in readable form", async () => {
    const encoded = await sealInvite(githubPayload, PASSPHRASE);
    expect(encoded).not.toContain(TOKEN);
    for (const part of encoded.split(".")) {
      expect(decodeBase64Url(part)).not.toContain("github_pat_");
      expect(decodeBase64Url(part)).not.toContain("setlists");
    }
  });

  it("has version, 16-byte salt, 12-byte IV and ciphertext", async () => {
    const [version, salt, iv, ciphertext] = (await sealInvite(githubPayload, PASSPHRASE)).split(
      ".",
    );
    expect(version).toBe("e1");
    expect(decodeBase64Url(salt)).toHaveLength(16);
    expect(decodeBase64Url(iv)).toHaveLength(12);
    expect(ciphertext.length).toBeGreaterThan(0);
  });

  it("uses a fresh salt and IV for every link", async () => {
    const a = await sealInvite(githubPayload, PASSPHRASE);
    const b = await sealInvite(githubPayload, PASSPHRASE);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
    expect(a.split(".")[2]).not.toBe(b.split(".")[2]);
  });

  it("rejects a wrong passphrase", async () => {
    const sealed = sealedOrFail(await sealInvite(githubPayload, PASSPHRASE));
    await expect(openSealedInvite(sealed, "lune-tigre-piano-48")).rejects.toBeInstanceOf(
      InvitePassphraseError,
    );
  });

  it("ignores case, accents and separators in the passphrase", async () => {
    const sealed = sealedOrFail(await sealInvite(githubPayload, PASSPHRASE));
    const payload = await openSealedInvite(sealed, "  Lune Tigre  PIANO_47 ");
    expect(payload).toEqual(githubPayload);
    expect(normalizePassphrase("Rivière Élan")).toBe("riviere-elan");
  });

  it("rejects tampered or truncated links", async () => {
    const [version, salt, iv, ciphertext] = (await sealInvite(githubPayload, PASSPHRASE)).split(
      ".",
    );
    const flip = (s: string, i: number) =>
      s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
    const tampered = [
      [version, salt, iv, flip(ciphertext, 5)],
      [version, salt, iv, flip(ciphertext, ciphertext.length - 3)],
      [version, flip(salt, 0), iv, ciphertext],
      [version, salt, flip(iv, 0), ciphertext],
      [version, salt, iv, ciphertext.slice(0, -4)],
      [version, salt, iv, `${ciphertext}*`],
    ];
    for (const parts of tampered) {
      await expect(openSealedInvite(parts.join("."), PASSPHRASE)).rejects.toBeInstanceOf(
        InvitePassphraseError,
      );
    }
  });

  it("refuses passphrases that are too short", async () => {
    await expect(sealInvite(githubPayload, "abc")).rejects.toThrow();
  });
});

describe("token-less invites", () => {
  it("drops the token and keeps repo coordinates", () => {
    const encoded = encodeOpenInvite(githubPayload);
    expect(encoded.startsWith("o1.")).toBe(true);
    expect(decodeBase64Url(encoded.slice(3))).not.toContain("github_pat_");

    const parsed = parseInvite(encoded);
    expect(parsed?.kind).toBe("open");
    if (parsed?.kind !== "open") return;
    expect(parsed.payload).toEqual({
      profile: githubPayload.profile,
      sync: { adapter: "github", owner: "band", repo: "setlists", path: "setlist.json" },
    });
    expect(exposesToken(parsed)).toBe(false);
  });

  it("cannot be applied without a token", () => {
    const parsed = parseInvite(encodeOpenInvite(githubPayload));
    if (parsed?.kind !== "open") throw new Error("expected open invite");
    expect(() => applyInvite(parsed.payload)).toThrow(/token/i);
  });

  it("carries Google Drive file ids as-is", () => {
    const drive: InvitePayload = {
      profile: { name: "Band" },
      sync: { adapter: "google-drive", fileId: "1AbC-dEf_123" },
    };
    expect(parseInvite(encodeOpenInvite(drive))).toEqual({ kind: "open", payload: drive });
  });
});

describe("legacy invites", () => {
  it("still decodes old base64 links and flags the exposed token", () => {
    const old = {
      profile: { name: "Café Swing" },
      sync: {
        adapter: "github",
        owner: "band",
        repo: "setlists",
        token: "ghp_abc",
        path: "s.json",
      },
    };
    const parsed = parseInvite(legacyEncode(old));
    expect(parsed).toEqual({ kind: "legacy", payload: old });
    if (!parsed) return;
    expect(exposesToken(parsed)).toBe(true);
  });

  it("does not flag old Google Drive links", () => {
    const old = { profile: { name: "Band" }, sync: { adapter: "google-drive", fileId: "xyz" } };
    const parsed = parseInvite(legacyEncode(old));
    expect(parsed?.kind).toBe("legacy");
    if (!parsed) return;
    expect(exposesToken(parsed)).toBe(false);
  });

  it("rejects garbage", () => {
    for (const bad of ["", "!!!", "e1.abc", "e1.a.b.c.d", "o1.%%%", "z9.abc", legacyEncode({})]) {
      expect(parseInvite(bad)).toBeNull();
    }
  });
});

describe("link encoding", () => {
  it("is URL-safe and small enough for a QR code", async () => {
    const longName: InvitePayload = {
      ...githubPayload,
      profile: { name: "Orchestre d'harmonie municipal de Saint-Rémy-de-Provence", avatar: "🎺" },
    };
    const links = [
      await sealInvite(longName, PASSPHRASE),
      encodeOpenInvite(longName),
      legacyEncode({ profile: { name: "Band" }, sync: githubPayload.sync }),
    ];
    for (const encoded of links) {
      expect(encoded).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(encodeURIComponent(encoded)).toBe(encoded);
      const url = `https://example.github.io/open-setlist/?join=${encoded}`;
      expect(url.length).toBeLessThan(2048);
    }
    expect(links[0].length).toBeLessThan(600);
  });
});

describe("passphrase generator", () => {
  it("has 128 distinct plain lowercase words per language", () => {
    for (const words of Object.values(PASSPHRASE_WORDS)) {
      expect(words).toHaveLength(128);
      expect(new Set(words).size).toBe(128);
      for (const w of words) expect(w).toMatch(/^[a-z]+$/);
    }
  });

  it("produces four words and a two-digit number", () => {
    for (const locale of ["en", "fr"] as const) {
      const parts = generatePassphrase(locale).split("-");
      expect(parts).toHaveLength(5);
      for (const w of parts.slice(0, 4)) expect(PASSPHRASE_WORDS[locale]).toContain(w);
      expect(parts[4]).toMatch(/^[1-9]\d$/);
    }
  });

  it("is already normalized", () => {
    const p = generatePassphrase("fr");
    expect(normalizePassphrase(p)).toBe(p);
  });
});
