import { useSyncExternalStore } from "react";

export interface Profile {
  id: string;
  name: string;
  avatar?: string;
  isDemo?: boolean;
  createdAt: number;
}

const PROFILES_KEY = "open-setlist-profiles";
const ACTIVE_KEY = "open-setlist-active-profile";

// --- CRUD ---

export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  notifyListeners();
}

export function addProfile(profile: Profile): void {
  const profiles = loadProfiles();
  profiles.push(profile);
  saveProfiles(profiles);
}

export function updateProfile(
  id: string,
  updates: Partial<Pick<Profile, "name" | "avatar">>,
): void {
  const profiles = loadProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return;
  profiles[idx] = { ...profiles[idx], ...updates };
  saveProfiles(profiles);
}

export function removeProfile(id: string): void {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
  // If the deleted profile was active, switch to the first remaining one
  if (getActiveProfileId() === id && profiles.length > 0) {
    setActiveProfileId(profiles[0].id);
  }
}

// --- Active profile ---

export function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProfileId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
  notifyListeners();
}

// --- Ensure a default profile exists ---

export function ensureDefaultProfile(): string {
  let profiles = loadProfiles();
  if (profiles.length === 0) {
    const id = crypto.randomUUID();
    profiles = [{ id, name: "Demo", avatar: "\u{1F3AF}", isDemo: true, createdAt: Date.now() }];
    saveProfiles(profiles);
  }
  let activeId = getActiveProfileId();
  if (!activeId || !profiles.some((p) => p.id === activeId)) {
    activeId = profiles[0].id;
    setActiveProfileId(activeId);
  }
  return activeId;
}

// --- React hook with useSyncExternalStore ---

let listeners: Array<() => void> = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getProfilesSnapshot(): string {
  return localStorage.getItem(PROFILES_KEY) ?? "[]";
}

function getActiveSnapshot(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? "";
}

export function useProfiles(): Profile[] {
  const raw = useSyncExternalStore(subscribe, getProfilesSnapshot);
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function useActiveProfileId(): string {
  return useSyncExternalStore(subscribe, getActiveSnapshot);
}

export function useIsDemoProfile(): boolean {
  const profiles = useProfiles();
  const activeId = useActiveProfileId();
  const active = profiles.find((p) => p.id === activeId);
  return active?.isDemo === true;
}
