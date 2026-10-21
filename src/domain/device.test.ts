import { DEVICE_PLATFORM, detectPlatform, deviceDisplayName, deviceId } from "./device";
import { installMemoryLocalStorage } from "./sync/test-fakes";

const AGENTS = {
  iPadOld:
    "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  iPadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  chromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("detectPlatform", () => {
  it("names the usual stage devices", () => {
    expect(detectPlatform(AGENTS.iPadOld, 5)).toBe(DEVICE_PLATFORM.iPad);
    expect(detectPlatform(AGENTS.iPhone, 5)).toBe(DEVICE_PLATFORM.iPhone);
    expect(detectPlatform(AGENTS.android, 5)).toBe(DEVICE_PLATFORM.android);
    expect(detectPlatform(AGENTS.windows)).toBe(DEVICE_PLATFORM.windows);
    expect(detectPlatform(AGENTS.linux)).toBe(DEVICE_PLATFORM.linux);
  });

  it("tells an iPad from a Mac by its touch screen", () => {
    expect(detectPlatform(AGENTS.iPadOs, 5)).toBe(DEVICE_PLATFORM.iPad);
    expect(detectPlatform(AGENTS.iPadOs, 0)).toBe(DEVICE_PLATFORM.mac);
  });

  it("falls back to other", () => {
    expect(detectPlatform(AGENTS.chromeOs)).toBe(DEVICE_PLATFORM.other);
    expect(detectPlatform("")).toBe(DEVICE_PLATFORM.other);
  });
});

describe("deviceDisplayName", () => {
  it("prefers the typed name", () => {
    expect(deviceDisplayName("  Max  ", "Keys", DEVICE_PLATFORM.iPad)).toBe("Max");
  });

  it("joins the part and the platform", () => {
    expect(deviceDisplayName("", "Keys", DEVICE_PLATFORM.iPad)).toBe("Keys · iPad");
    expect(deviceDisplayName("", "Keys", DEVICE_PLATFORM.other)).toBe("Keys");
    expect(deviceDisplayName("", "", DEVICE_PLATFORM.android)).toBe("Android");
    expect(deviceDisplayName("", "", DEVICE_PLATFORM.other)).toBe("other");
  });
});

describe("deviceId", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("stays the same from one call to the next", () => {
    const id = deviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceId()).toBe(id);
  });
});
