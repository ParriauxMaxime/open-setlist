/**
 * Looks for companion programs on the band's network: asks `/status` of every address of
 * one subnet (`192.168.1.1` to `.254`), on the companion's port, a few dozen at a time.
 *
 * Plain HTTP only, so Chrome alone can scan, after asking once for local network access.
 * Firefox and Safari block plain HTTP from the app, and HTTPS fails on a certificate they
 * were not told to trust yet: there, the QR code on the companion's screen pairs instead.
 * A web page cannot read its own address, hence the subnet the musician types.
 */

import { type CompanionStatus, companionStatus } from "./companion";
import { COMPANION_DEFAULT_PORT } from "./settings";

export const SCAN_DEFAULT_SUBNET = "192.168.1";
const SCAN_CONCURRENCY = 32;
const SCAN_TIMEOUT_MS = 1500;
const SUBNET_KEY = "open-setlist-companion-subnet";

/** `192.168.1`, `192.168.1.`, `192.168.1.0`, `192.168.1.x` or `192.168.1.0/24` → `192.168.1`. */
export function normalizeSubnet(input: string): string | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\.(?:\d{1,3}|x|\*)?)?(?:\/24)?$/i.exec(
    input.trim(),
  );
  if (!match) return null;
  const parts = match.slice(1, 4).map(Number);
  return parts.every((part) => part <= 255) ? parts.join(".") : null;
}

/** The companion's address at each host of the subnet, `.1` to `.254`. */
export function subnetBases(subnet: string, port = COMPANION_DEFAULT_PORT): string[] {
  return Array.from({ length: 254 }, (_, i) => `http://${subnet}.${i + 1}:${port}`);
}

export interface ScanFound {
  base: string;
  status: CompanionStatus;
}

export interface ScanOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  onFound?: (found: ScanFound) => void;
  /** Addresses asked so far, out of 254. */
  onProgress?: (done: number) => void;
}

export async function scanSubnet(subnet: string, options: ScanOptions = {}): Promise<ScanFound[]> {
  const queue = subnetBases(subnet);
  const found: ScanFound[] = [];
  let done = 0;
  const worker = async () => {
    for (let base = queue.shift(); base && !options.signal?.aborted; base = queue.shift()) {
      try {
        const status = await companionStatus(base, {
          fetch: options.fetch,
          signal: options.signal,
          timeoutMs: SCAN_TIMEOUT_MS,
        });
        found.push({ base, status });
        options.onFound?.({ base, status });
      } catch {
        // Nobody there, or not a companion
      }
      options.onProgress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));
  return found;
}

export function loadScanSubnet(): string {
  return localStorage.getItem(SUBNET_KEY) ?? SCAN_DEFAULT_SUBNET;
}

export function saveScanSubnet(subnet: string): void {
  localStorage.setItem(SUBNET_KEY, subnet);
}
