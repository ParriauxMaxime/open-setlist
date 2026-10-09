// Tempo pulse, count-in and setlist "next up" logic for performance mode.
// Pure functions only — the Web Audio scheduler lives in
// src/modules/performance/hooks/use-tempo.ts.

import { transposeKey } from "./chords/transpose";

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

export const BPM_MIN = 20;
export const BPM_MAX = 400;
export const DEFAULT_BEATS_PER_BAR = 4;
const MAX_BEATS_PER_BAR = 16;

/** Click sound: short sine blip, higher pitch on beat 1. */
export const CLICK_FREQUENCY_HZ = 1000;
export const CLICK_ACCENT_FREQUENCY_HZ = 1500;
export const CLICK_DURATION_S = 0.04;

export function isPlayableBpm(bpm: number | undefined): bpm is number {
  return typeof bpm === "number" && Number.isFinite(bpm) && bpm >= BPM_MIN && bpm <= BPM_MAX;
}

/** Seconds between two beats. */
export function beatInterval(bpm: number): number {
  return 60 / bpm;
}

/** Beats per bar from a ChordPro `{time}` value ("3/4", "6/8"); 4 when absent or invalid. */
export function beatsPerBar(time: string | undefined): number {
  const match = time?.match(/^\s*(\d{1,2})\s*\/\s*\d{1,2}\s*$/);
  if (!match) return DEFAULT_BEATS_PER_BAR;
  const beats = Number(match[1]);
  return beats >= 1 && beats <= MAX_BEATS_PER_BAR ? beats : DEFAULT_BEATS_PER_BAR;
}

/** Beat 1 of every bar is accented. */
export function isAccentBeat(index: number, perBar: number): boolean {
  return index % perBar === 0;
}

export function clickFrequency(accent: boolean): number {
  return accent ? CLICK_ACCENT_FREQUENCY_HZ : CLICK_FREQUENCY_HZ;
}

// ---------------------------------------------------------------------------
// Lookahead scheduling
// ---------------------------------------------------------------------------

/**
 * A metronome run. Beat `i` sounds at `startTime + i * interval`: times are
 * derived from the start, never accumulated, so they cannot drift.
 */
export interface BeatRun {
  /** Seconds, in the scheduler's clock (AudioContext or performance time). */
  startTime: number;
  interval: number;
  beatsPerBar: number;
  /** Leading beats that form the count-in (0 for none). */
  countInBeats: number;
  /** Beats before the run ends on its own, or null to run until stopped. */
  totalBeats: number | null;
}

export interface ScheduledBeat {
  index: number;
  time: number;
  /** 1-based position in the bar — the number shown during a count-in. */
  beat: number;
  accent: boolean;
  countIn: boolean;
}

export interface BeatRunOptions {
  startTime: number;
  bpm: number;
  beatsPerBar: number;
  /** Prepend one bar of count-in. */
  countIn: boolean;
  /** Keep pulsing after the count-in; when false the run stops after it. */
  continuous: boolean;
}

export function createBeatRun(options: BeatRunOptions): BeatRun {
  const countInBeats = options.countIn ? options.beatsPerBar : 0;
  return {
    startTime: options.startTime,
    interval: beatInterval(options.bpm),
    beatsPerBar: options.beatsPerBar,
    countInBeats,
    totalBeats: options.continuous ? null : countInBeats,
  };
}

/**
 * Beats to schedule in the lookahead window `[now, until)`, starting at
 * `fromIndex`. Beats already in the past (scheduler fell behind, e.g. a
 * throttled background tab) are skipped rather than played late.
 */
export function beatsInWindow(
  run: BeatRun,
  fromIndex: number,
  now: number,
  until: number,
): { beats: ScheduledBeat[]; nextIndex: number } {
  const beats: ScheduledBeat[] = [];
  let index = fromIndex;
  while (run.totalBeats === null || index < run.totalBeats) {
    const time = run.startTime + index * run.interval;
    if (time >= until) break;
    if (time >= now) {
      beats.push({
        index,
        time,
        beat: (index % run.beatsPerBar) + 1,
        accent: isAccentBeat(index, run.beatsPerBar),
        countIn: index < run.countInBeats,
      });
    }
    index++;
  }
  return { beats, nextIndex: index };
}

/** When the count-in bar is over (i.e. the song's first downbeat), or null without count-in. */
export function countInEndTime(run: BeatRun): number | null {
  return run.countInBeats > 0 ? run.startTime + run.countInBeats * run.interval : null;
}

/** When a bounded run is over (one interval after its last beat), or null if continuous. */
export function runEndTime(run: BeatRun): number | null {
  return run.totalBeats === null ? null : run.startTime + run.totalBeats * run.interval;
}

// ---------------------------------------------------------------------------
// Next song preview
// ---------------------------------------------------------------------------

export interface SongPreviewSource {
  key?: string;
  bpm?: number;
  transposition?: number;
}

export interface SongPreview {
  key?: string;
  /** Key a transposing part reads ("My part" at written pitch); undefined in concert pitch. */
  writtenKey?: string;
  bpm?: number;
  setup?: string;
}

/** Key the band actually plays, after the song's transposition. */
export function playedKey(key: string | undefined, transposition = 0): string | undefined {
  const trimmed = key?.trim();
  if (!trimmed) return undefined;
  return transposition ? (transposeKey(trimmed, transposition) ?? trimmed) : trimmed;
}

/**
 * What musicians need to prepare before the next song: key, tempo, setup line.
 * `writtenShift` is the device's part shift (`writtenPitchShift`, capo included): a B♭
 * trumpet (+2) also gets the key it reads, concert Gm → written Am.
 */
export function buildSongPreview(
  song: SongPreviewSource,
  setup: string | undefined,
  writtenShift = 0,
): SongPreview {
  return {
    key: playedKey(song.key, song.transposition),
    writtenKey: writtenShift
      ? transposeKey(song.key, (song.transposition ?? 0) + writtenShift)
      : undefined,
    bpm: isPlayableBpm(song.bpm) ? song.bpm : undefined,
    setup: setup?.trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// Set breaks
// ---------------------------------------------------------------------------

export interface SetPosition {
  setIndex: number;
  setName: string;
}

/** True when moving from `from` to `to` crosses into another set. */
export function isSetBreak(
  from: SetPosition | undefined,
  to: SetPosition | undefined,
): to is SetPosition {
  return !!from && !!to && from.setIndex !== to.setIndex;
}

/** The set's name, or a numbered fallback ("Set 2") when it is blank. */
export function setLabel(position: SetPosition, fallback: (setNumber: number) => string): string {
  return position.setName.trim() || fallback(position.setIndex + 1);
}
