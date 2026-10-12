import {
  BAND_CODE_LENGTH,
  BandBlobError,
  deriveBandKeys,
  formatBandCode,
  generateBandCode,
  normalizeBandCode,
  openBlob,
  sealBlob,
} from "./band-code";

const CODE = "K7QM9XTD2B4H8R0EWZ5N3A6CVPGY";

describe("band code", () => {
  it("generates distinct codes from the unambiguous alphabet", () => {
    const codes = Array.from({ length: 50 }, generateBandCode);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
      expect(code).toHaveLength(BAND_CODE_LENGTH);
      expect(normalizeBandCode(code)).toBe(code);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("formats in groups of four", () => {
    expect(formatBandCode(CODE)).toBe("K7QM-9XTD-2B4H-8R0E-WZ5N-3A6C-VPGY");
  });

  it("reads a code however it was typed", () => {
    expect(normalizeBandCode(formatBandCode(CODE))).toBe(CODE);
    expect(normalizeBandCode(`  ${formatBandCode(CODE).toLowerCase()} \n`)).toBe(CODE);
    expect(normalizeBandCode(CODE.replace(/-/g, " "))).toBe(CODE);
    // O, I and L are not in the alphabet: they can only be a misread 0 or 1.
    expect(normalizeBandCode("O".repeat(BAND_CODE_LENGTH))).toBe("0".repeat(BAND_CODE_LENGTH));
    expect(normalizeBandCode("iL".repeat(BAND_CODE_LENGTH / 2))).toBe("1".repeat(BAND_CODE_LENGTH));
  });

  it("rejects anything that is not a code", () => {
    expect(normalizeBandCode("")).toBeNull();
    expect(normalizeBandCode(CODE.slice(1))).toBeNull();
    expect(normalizeBandCode(`${CODE}A`)).toBeNull();
    expect(normalizeBandCode(`${CODE.slice(1)}U`)).toBeNull();
    expect(normalizeBandCode(`${CODE.slice(1)}!`)).toBeNull();
  });
});

describe("band keys", () => {
  it("derives the same keys on every device", async () => {
    const a = await deriveBandKeys(CODE);
    const b = await deriveBandKeys(CODE);
    expect(a.bandId).toBe(b.bandId);
    expect(a.authToken).toBe(b.authToken);
    expect(a.bandId).toMatch(/^[0-9a-f]{32}$/);
    expect(a.authToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the relay nothing that leads back to the code", async () => {
    const keys = await deriveBandKeys(CODE);
    expect(keys.bandId).not.toBe(keys.authToken.slice(0, 32));
    expect(`${keys.bandId}${keys.authToken}`.toUpperCase()).not.toContain(CODE.slice(0, 8));
    expect(keys.key.extractable).toBe(false);
  });

  it("derives unrelated keys from another code", async () => {
    const a = await deriveBandKeys(CODE);
    const b = await deriveBandKeys(`${CODE.slice(0, -1)}Z`);
    expect(b.bandId).not.toBe(a.bandId);
    expect(b.authToken).not.toBe(a.authToken);
  });
});

describe("sealed blobs", () => {
  const content = JSON.stringify({
    title: "Les Rêveurs du Dimanche \u{1F3B8}",
    lines: "la ".repeat(500),
  });

  it("round-trips and hides the content", async () => {
    const keys = await deriveBandKeys(CODE);
    const sealed = await sealBlob(keys, "snapshot", 3, content);
    expect(await openBlob(keys, "snapshot", 3, sealed)).toBe(content);
    expect(Buffer.from(sealed).toString("latin1")).not.toContain("la la");
    expect(Buffer.from(sealed).includes(Buffer.from("Rêveurs"))).toBe(false);
  });

  it("compresses before encrypting", async () => {
    const keys = await deriveBandKeys(CODE);
    const sealed = await sealBlob(keys, "snapshot", 1, content);
    expect(sealed.length).toBeLessThan(content.length / 4);
  });

  it("never produces the same bytes twice", async () => {
    const keys = await deriveBandKeys(CODE);
    const a = await sealBlob(keys, "snapshot", 1, content);
    const b = await sealBlob(keys, "snapshot", 1, content);
    expect(Buffer.from(a).equals(b)).toBe(false);
  });

  it("does not open with another band's code", async () => {
    const sealed = await sealBlob(await deriveBandKeys(CODE), "snapshot", 1, content);
    const other = await deriveBandKeys(generateBandCode());
    await expect(openBlob(other, "snapshot", 1, sealed)).rejects.toBeInstanceOf(BandBlobError);
  });

  it("does not open when a single byte was changed", async () => {
    const keys = await deriveBandKeys(CODE);
    const sealed = await sealBlob(keys, "snapshot", 1, content);
    for (const index of [0, 5, 20, sealed.length - 1]) {
      const tampered = sealed.slice();
      tampered[index] ^= 1;
      await expect(openBlob(keys, "snapshot", 1, tampered)).rejects.toBeInstanceOf(BandBlobError);
    }
    await expect(openBlob(keys, "snapshot", 1, sealed.slice(0, 10))).rejects.toBeInstanceOf(
      BandBlobError,
    );
  });

  it("only opens as the kind and version it was sealed for", async () => {
    const keys = await deriveBandKeys(CODE);
    const sealed = await sealBlob(keys, "snapshot", 4, content);
    await expect(openBlob(keys, "snapshot", 5, sealed)).rejects.toBeInstanceOf(BandBlobError);
    await expect(openBlob(keys, "meta", 4, sealed)).rejects.toBeInstanceOf(BandBlobError);
  });
});
