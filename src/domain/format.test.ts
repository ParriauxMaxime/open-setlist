import { formatDuration, formatLongDuration, parseDuration } from "./format";

describe("formatLongDuration", () => {
  it("keeps minutes and seconds under an hour", () => {
    expect(formatLongDuration(210)).toBe("3:30");
    expect(formatLongDuration(3599)).toBe("59:59");
  });

  it("reads hours and minutes from an hour on", () => {
    expect(formatLongDuration(3600)).toBe("1h00");
    expect(formatLongDuration(6120)).toBe("1h42");
    expect(formatLongDuration(6150)).toBe("1h43");
    expect(formatLongDuration(7170)).toBe("2h00");
  });
});

describe("parseDuration", () => {
  it("reads minutes and seconds", () => {
    expect(parseDuration("5:34")).toBe(334);
    expect(parseDuration(" 3:05 ")).toBe(185);
    expect(parseDuration("0:45")).toBe(45);
    expect(parseDuration("4:5")).toBe(245);
  });

  it("takes a bare number as minutes", () => {
    expect(parseDuration("4")).toBe(240);
  });

  it("is undefined for nothing, null for what it cannot read", () => {
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("0:00")).toBeUndefined();
    expect(parseDuration("5:75")).toBeNull();
    expect(parseDuration("cinq")).toBeNull();
  });

  it("round-trips with formatDuration", () => {
    expect(parseDuration(formatDuration(334))).toBe(334);
  });
});
