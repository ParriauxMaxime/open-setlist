// Stage ergonomics for performance mode: pedal/keyboard mapping, page-turn
// scrolling and auto-scroll speed. Pure functions only — hooks live in
// src/modules/performance/hooks/.

// ---------------------------------------------------------------------------
// Key → action mapping
// ---------------------------------------------------------------------------

export const PerformAction = {
  Forward: "forward",
  Back: "back",
  NextSong: "nextSong",
  PrevSong: "prevSong",
  ToggleAutoScroll: "toggleAutoScroll",
  ToggleChrome: "toggleChrome",
} as const;

export type PerformAction = (typeof PerformAction)[keyof typeof PerformAction];

export const PERFORM_ACTION_LIST = Object.values(PerformAction);

/** Key that toggles auto-scroll (case-insensitive). */
export const AUTO_SCROLL_KEY = "s";

export interface KeyInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Map a keydown to a performance action. Page-turner pedals typically send
 * PageDown/PageUp, ArrowDown/ArrowUp, ArrowRight/ArrowLeft or Space.
 */
export function keyToPerformAction(input: KeyInput): PerformAction | null {
  // Leave browser/OS shortcuts (Cmd+Arrow, Ctrl+PageDown, …) alone
  if (input.ctrlKey || input.metaKey || input.altKey) return null;

  switch (input.key) {
    case "PageDown":
    case "ArrowDown":
      return PerformAction.Forward;
    case "PageUp":
    case "ArrowUp":
      return PerformAction.Back;
    case " ":
    case "Spacebar":
      return input.shiftKey ? PerformAction.Back : PerformAction.Forward;
    case "ArrowRight":
      return PerformAction.NextSong;
    case "ArrowLeft":
      return PerformAction.PrevSong;
    case "Escape":
      return PerformAction.ToggleChrome;
  }
  if (input.key.toLowerCase() === AUTO_SCROLL_KEY) return PerformAction.ToggleAutoScroll;
  return null;
}

export interface KeyTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

/** True when keystrokes should go to a text field rather than performance controls. */
export function isEditableTarget(target: KeyTargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// ---------------------------------------------------------------------------
// Page-turn scroll step
// ---------------------------------------------------------------------------

/** Fraction of the viewport kept visible across a page turn. */
export const PAGE_OVERLAP_RATIO = 0.15;

/** Pixels of slack when deciding we're at the top/bottom (sub-pixel rounding). */
const EDGE_TOLERANCE = 2;

export interface ScrollMetrics {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export type ScrollStep = { type: "scroll"; top: number } | { type: "song" };

/**
 * Decide what a forward/back page turn does: scroll by ~one viewport, or —
 * when already at the bottom (forward) / top (back) — change song.
 */
export function computeScrollStep(
  metrics: ScrollMetrics,
  direction: "forward" | "back",
): ScrollStep {
  const { scrollTop, clientHeight, scrollHeight } = metrics;
  const maxTop = Math.max(0, scrollHeight - clientHeight);
  const page = Math.max(1, clientHeight * (1 - PAGE_OVERLAP_RATIO));

  if (direction === "forward") {
    if (scrollTop >= maxTop - EDGE_TOLERANCE) return { type: "song" };
    return { type: "scroll", top: Math.min(maxTop, scrollTop + page) };
  }
  if (scrollTop <= EDGE_TOLERANCE) return { type: "song" };
  return { type: "scroll", top: Math.max(0, scrollTop - page) };
}

// ---------------------------------------------------------------------------
// Auto-scroll speed
// ---------------------------------------------------------------------------

export const SCROLL_SPEED_MIN = 1;
export const SCROLL_SPEED_MAX = 10;
export const SCROLL_SPEED_DEFAULT = 5;

// Exponential scale: level 1 ≈ 5 px/s (slow ballad, small text), level 10 ≈ 100 px/s.
const BASE_PX_PER_SECOND = 5;
const SPEED_GROWTH = 1.4;

// Portion of the song assumed to be intro before the first line needs reading.
const INTRO_RATIO = 0.15;
const INTRO_MAX_SECONDS = 30;

export function clampScrollSpeed(level: number): number {
  return Math.min(SCROLL_SPEED_MAX, Math.max(SCROLL_SPEED_MIN, level));
}

/** Pixels per second for a (possibly fractional) speed level. */
export function scrollSpeedToPxPerSecond(level: number): number {
  return BASE_PX_PER_SECOND * SPEED_GROWTH ** (clampScrollSpeed(level) - 1);
}

/** Inverse of scrollSpeedToPxPerSecond, clamped to the 1–10 range. */
export function pxPerSecondToScrollSpeed(pxPerSecond: number): number {
  if (!(pxPerSecond > 0)) return SCROLL_SPEED_MIN;
  return clampScrollSpeed(1 + Math.log(pxPerSecond / BASE_PX_PER_SECOND) / Math.log(SPEED_GROWTH));
}

/**
 * Speed used when the song has no explicit scrollSpeed: if the duration is
 * known, pick the (fractional) level that scrolls the content over the song's
 * duration minus its intro; otherwise a medium default.
 */
export function defaultScrollSpeed(
  durationSeconds: number | undefined,
  scrollDistancePx: number,
): number {
  if (!durationSeconds || durationSeconds <= 0 || scrollDistancePx <= 0) {
    return SCROLL_SPEED_DEFAULT;
  }
  const intro = Math.min(INTRO_MAX_SECONDS, durationSeconds * INTRO_RATIO);
  return pxPerSecondToScrollSpeed(scrollDistancePx / (durationSeconds - intro));
}

/** Next stored speed after a +/- tap, starting from the (possibly derived) current level. */
export function stepScrollSpeed(current: number, delta: number): number {
  return clampScrollSpeed(Math.round(current) + delta);
}
