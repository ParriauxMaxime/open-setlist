/**
 * Who this device is to the companion program: a stable id, kept in localStorage and never
 * synced, and a name its admin page can show.
 */

import { createId } from "./id";

export const DEVICE_PLATFORM = {
  iPad: "iPad",
  iPhone: "iPhone",
  android: "Android",
  mac: "Mac",
  windows: "Windows",
  linux: "Linux",
  other: "other",
} as const;

export type DevicePlatform = (typeof DEVICE_PLATFORM)[keyof typeof DEVICE_PLATFORM];

export const DEVICE_PLATFORM_VALUES: DevicePlatform[] = Object.values(DEVICE_PLATFORM);

/** iPadOS browsers send a desktop Mac's user agent: only the touch screen gives them away. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): DevicePlatform {
  if (/iPad/.test(userAgent)) return DEVICE_PLATFORM.iPad;
  if (/iPhone|iPod/.test(userAgent)) return DEVICE_PLATFORM.iPhone;
  if (/Android/.test(userAgent)) return DEVICE_PLATFORM.android;
  if (/Macintosh|Mac OS X/.test(userAgent)) {
    return maxTouchPoints > 1 ? DEVICE_PLATFORM.iPad : DEVICE_PLATFORM.mac;
  }
  if (/Windows/.test(userAgent)) return DEVICE_PLATFORM.windows;
  if (/CrOS/.test(userAgent)) return DEVICE_PLATFORM.other;
  if (/Linux|X11/.test(userAgent)) return DEVICE_PLATFORM.linux;
  return DEVICE_PLATFORM.other;
}

export function currentPlatform(): DevicePlatform {
  if (typeof navigator === "undefined") return DEVICE_PLATFORM.other;
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
}

/** The name typed in the settings, else `Keys · iPad`. */
export function deviceDisplayName(name: string, part: string, platform: DevicePlatform): string {
  const typed = name.trim();
  if (typed) return typed;
  const known = platform === DEVICE_PLATFORM.other ? "" : platform;
  return [part, known].filter(Boolean).join(" · ") || platform;
}

const DEVICE_ID_KEY = "open-setlist-device-id";

/** This device's id, created on first use. */
export function deviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const id = createId();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
