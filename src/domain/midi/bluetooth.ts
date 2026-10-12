/**
 * Bluetooth MIDI out (standard "MIDI over Bluetooth LE"): the companion program advertises
 * itself that way, and so does plenty of hardware (BLE MIDI adapters, some pedalboards).
 *
 * Web Bluetooth only: Chrome and Edge, on Android and desktop. The browser shows its own
 * device chooser, so connecting needs a tap; the connection then lives as long as the page.
 */

export const BLE_MIDI_SERVICE = "03b80e5a-ede8-4b33-a751-6ce34ec4c700";
export const BLE_MIDI_CHARACTERISTIC = "7772e5db-3868-4112-a1a9-f2669d106bf3";

/** A BLE packet carries 20 bytes unless a larger MTU was negotiated, which a page cannot know. */
const PACKET_BYTES = 20;
const RECONNECT_MS = 2000;

/**
 * BLE MIDI packets for these messages: a header byte with the high timestamp bits, then
 * each message behind a byte with the low ones.
 */
export function encodeBleMidi(
  messages: number[][],
  timestampMs: number,
): Uint8Array<ArrayBuffer>[] {
  const header = 0x80 | ((timestampMs >> 7) & 0x3f);
  const low = 0x80 | (timestampMs & 0x7f);
  const packets: number[][] = [];
  let current: number[] = [header];
  for (const message of messages) {
    if (current.length > 1 && current.length + 1 + message.length > PACKET_BYTES) {
      packets.push(current);
      current = [header];
    }
    current.push(low, ...message);
  }
  if (current.length > 1) packets.push(current);
  return packets.map((bytes) => new Uint8Array(bytes));
}

// Web Bluetooth is not in TypeScript's DOM library: the few members used here
interface GattCharacteristic {
  readValue(): Promise<DataView>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}
interface GattServer {
  connected: boolean;
  connect(): Promise<GattServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<{
    getCharacteristic(uuid: string): Promise<GattCharacteristic>;
  }>;
}
interface BluetoothDeviceLike extends EventTarget {
  name?: string;
  gatt?: GattServer;
}
interface BluetoothLike {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<BluetoothDeviceLike>;
}

function bluetooth(): BluetoothLike | undefined {
  return (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth;
}

export const BLE_STATE = {
  unsupported: "unsupported",
  disconnected: "disconnected",
  connecting: "connecting",
  connected: "connected",
} as const;

export type BleState = (typeof BLE_STATE)[keyof typeof BLE_STATE];

export interface BleStatus {
  state: BleState;
  deviceName?: string;
}

let device: BluetoothDeviceLike | null = null;
let characteristic: GattCharacteristic | null = null;
let status: BleStatus = { state: BLE_STATE.disconnected };
let listeners: Array<() => void> = [];
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function setStatus(next: BleStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

export function subscribeBleMidi(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function bleMidiStatus(): BleStatus {
  if (typeof navigator === "undefined" || !bluetooth()) return UNSUPPORTED;
  return status;
}

const UNSUPPORTED: BleStatus = { state: BLE_STATE.unsupported };

async function open(target: BluetoothDeviceLike): Promise<void> {
  if (!target.gatt) throw new Error("Not a GATT device");
  setStatus({ state: BLE_STATE.connecting, deviceName: target.name });
  const server = await target.gatt.connect();
  const service = await server.getPrimaryService(BLE_MIDI_SERVICE);
  characteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);
  // The BLE MIDI spec asks for one read after connecting; some devices pair on it
  await characteristic.readValue().catch(() => undefined);
  setStatus({ state: BLE_STATE.connected, deviceName: target.name });
}

function reconnectLater(target: BluetoothDeviceLike): void {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (device !== target) return;
    open(target).catch(() => reconnectLater(target));
  }, RECONNECT_MS);
}

/** Shows the browser's device chooser: call it from a tap. Rejects if the musician cancels. */
export async function connectBleMidi(): Promise<void> {
  const api = bluetooth();
  if (!api) throw new Error("Web Bluetooth is not available");
  const chosen = await api.requestDevice({ filters: [{ services: [BLE_MIDI_SERVICE] }] });
  disconnectBleMidi();
  device = chosen;
  chosen.addEventListener("gattserverdisconnected", () => {
    if (device !== chosen) return;
    characteristic = null;
    setStatus({ state: BLE_STATE.connecting, deviceName: chosen.name });
    reconnectLater(chosen);
  });
  try {
    await open(chosen);
  } catch (err) {
    disconnectBleMidi();
    throw err;
  }
}

export function disconnectBleMidi(): void {
  clearTimeout(reconnectTimer);
  const previous = device;
  device = null;
  characteristic = null;
  previous?.gatt?.disconnect();
  setStatus({ state: BLE_STATE.disconnected });
}

/** Rejects when no device is connected. */
export async function sendBleMidi(messages: number[][]): Promise<void> {
  const target = characteristic;
  if (!target) throw new Error("No Bluetooth MIDI device connected");
  for (const packet of encodeBleMidi(messages, Math.floor(performance.now()))) {
    await target.writeValueWithoutResponse(packet);
  }
}
