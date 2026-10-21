import { normalizeSubnet, scanSubnet, subnetBases } from "./scan";

describe("normalizeSubnet", () => {
  it("reads the first three numbers of an address", () => {
    for (const input of [
      "192.168.1",
      " 192.168.1. ",
      "192.168.1.0",
      "192.168.1.x",
      "192.168.1.0/24",
    ]) {
      expect(normalizeSubnet(input)).toBe("192.168.1");
    }
    expect(normalizeSubnet("10.0.0.42")).toBe("10.0.0");
  });

  it("refuses what is not one", () => {
    for (const input of ["", "192.168", "192.168.300", "studio.local", "192.168.1.0/16"]) {
      expect(normalizeSubnet(input)).toBeNull();
    }
  });
});

describe("subnetBases", () => {
  it("lists every host on the companion's port, over plain HTTP", () => {
    const bases = subnetBases("192.168.1");
    expect(bases).toHaveLength(254);
    expect(bases[0]).toBe("http://192.168.1.1:7777");
    expect(bases[253]).toBe("http://192.168.1.254:7777");
  });
});

describe("scanSubnet", () => {
  const status = {
    app: "open-setlist-companion",
    version: "0.4.0",
    name: "Stage PC",
    midiOut: null,
  };

  it("finds the companions among the hosts that answer", async () => {
    const asked: string[] = [];
    const fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url === "http://192.168.1.20:7777/status") return new Response(JSON.stringify(status));
      if (url === "http://192.168.1.1:7777/status") return new Response("<html>router</html>");
      throw new TypeError("Failed to fetch");
    }) as typeof globalThis.fetch;
    const progress: number[] = [];
    const found = await scanSubnet("192.168.1", {
      fetch,
      onProgress: (done) => progress.push(done),
    });
    expect(found).toEqual([{ base: "http://192.168.1.20:7777", status }]);
    expect(asked).toHaveLength(254);
    expect(progress.at(-1)).toBe(254);
  });

  it("stops when the scan is called off", async () => {
    const abort = new AbortController();
    let asked = 0;
    const fetch = (async () => {
      asked += 1;
      abort.abort();
      throw new TypeError("Failed to fetch");
    }) as typeof globalThis.fetch;
    await scanSubnet("10.0.0", { fetch, signal: abort.signal });
    expect(asked).toBeLessThanOrEqual(32);
  });
});
