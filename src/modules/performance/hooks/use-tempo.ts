import { parse } from "@domain/chordpro/parser";
import {
  beatsInWindow,
  beatsPerBar,
  CLICK_DURATION_S,
  clickFrequency,
  countInEndTime,
  createBeatRun,
  isPlayableBpm,
  runEndTime,
  type ScheduledBeat,
} from "@domain/perform-tempo";
import { loadPreferences, savePreferences } from "@domain/preferences";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

// Classic Web Audio lookahead scheduler: a coarse timer wakes up often and
// queues every beat due in the next SCHEDULE_AHEAD_S on the audio clock.
const TIMER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;
// Leaves the first tick time to queue beat 1 before it is due
const START_DELAY_S = 0.05;
// Give up waiting for the audio clock and pulse silently
const AUDIO_START_TIMEOUT_MS = 1000;
const AUDIO_START_POLL_MS = 10;

interface Clock {
  now: () => number;
  audio: AudioContext | null;
}

const performanceClock: Clock = { now: () => performance.now() / 1000, audio: null };

async function startClock(ctx: AudioContext | null): Promise<Clock> {
  if (!ctx) return performanceClock;
  void ctx.resume().catch(() => undefined);
  // "running" is not enough: a cold audio device can hold currentTime still for a while
  const initial = ctx.currentTime;
  const deadline = performance.now() + AUDIO_START_TIMEOUT_MS;
  while (performance.now() < deadline) {
    if (ctx.state === "running" && ctx.currentTime > initial) {
      return { now: () => ctx.currentTime, audio: ctx };
    }
    await new Promise((resolve) => setTimeout(resolve, AUDIO_START_POLL_MS));
  }
  return performanceClock;
}

function playClick(ctx: AudioContext, time: number, accent: boolean): AudioNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = clickFrequency(accent);
  gain.gain.setValueAtTime(accent ? 0.9 : 0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + CLICK_DURATION_S);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + CLICK_DURATION_S);
  return gain;
}

/** Current beat, as a tiny external store so only subscribers re-render on each beat. */
export interface BeatStore {
  get: () => ScheduledBeat | null;
  set: (beat: ScheduledBeat | null) => void;
  subscribe: (listener: () => void) => () => void;
}

function createBeatStore(): BeatStore {
  let beat: ScheduledBeat | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => beat,
    set: (next) => {
      beat = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useBeat(store: BeatStore): ScheduledBeat | null {
  return useSyncExternalStore(store.subscribe, store.get);
}

interface RunRequest {
  pulse: boolean;
  countIn: boolean;
}

interface UseTempoOptions {
  bpm: number | undefined;
  /** ChordPro source, read for `{time: 3/4}`. */
  content: string | undefined;
  /** Changes when the displayed song changes — stops the pulse. */
  songKey: string | undefined;
  /** Called on the song's first downbeat, right after a count-in. */
  onCountInEnd?: () => void;
}

export function useTempo({ bpm, content, songKey, onCountInEnd }: UseTempoOptions) {
  const perBar = useMemo(
    () => beatsPerBar(content ? parse(content).metadata.time : undefined),
    [content],
  );
  const [run, setRun] = useState<RunRequest | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(() => loadPreferences().performClickSound);
  const [beats] = useState(createBeatStore);
  const audioRef = useRef<AudioContext | null>(null);
  const onCountInEndRef = useRef(onCountInEnd);
  onCountInEndRef.current = onCountInEnd;

  // Must run inside the tap handler: iOS only lets a user gesture start audio
  const unlockAudio = useCallback(() => {
    if (typeof AudioContext === "undefined") return;
    if (!audioRef.current) audioRef.current = new AudioContext();
    void audioRef.current.resume().catch(() => undefined);
  }, []);

  const active = run !== null;
  const toggle = useCallback(() => {
    if (!active && audioEnabled) unlockAudio();
    setRun((current) => (current ? null : { pulse: true, countIn: false }));
  }, [active, audioEnabled, unlockAudio]);

  const countIn = useCallback(() => {
    if (audioEnabled) unlockAudio();
    setRun((current) => ({ pulse: current?.pulse ?? false, countIn: true }));
  }, [audioEnabled, unlockAudio]);

  const toggleAudio = useCallback(() => {
    const next = !audioEnabled;
    if (next) unlockAudio();
    setAudioEnabled(next);
    savePreferences({ ...loadPreferences(), performClickSound: next });
  }, [audioEnabled, unlockAudio]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: songKey is the intentional trigger
  useEffect(() => {
    setRun(null);
  }, [songKey]);

  useEffect(() => {
    if (!run || !isPlayableBpm(bpm)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const pending = new Set<ReturnType<typeof setTimeout>>();
    // Clicks already queued on the audio clock, silenced if we stop early
    const queued = new Set<AudioNode>();

    void startClock(audioEnabled ? audioRef.current : null).then((clock) => {
      if (cancelled) return;
      // Flash when the click reaches the speakers, not when it leaves the graph
      const visualDelay = clock.audio?.outputLatency || 0;
      const beatRun = createBeatRun({
        startTime: clock.now() + START_DELAY_S,
        bpm,
        beatsPerBar: perBar,
        countIn: run.countIn,
        continuous: run.pulse,
      });
      const at = (time: number, fn: () => void) => {
        const id = setTimeout(
          () => {
            pending.delete(id);
            fn();
          },
          Math.max(0, (time - clock.now()) * 1000),
        );
        pending.add(id);
      };

      // Queued from the tick like beats, so they wait for the clock if it stalls
      let countInEnd = countInEndTime(beatRun);
      let end = runEndTime(beatRun);
      let nextIndex = 0;
      const tick = () => {
        const now = clock.now();
        const horizon = now + SCHEDULE_AHEAD_S;
        const due = beatsInWindow(beatRun, nextIndex, now, horizon);
        nextIndex = due.nextIndex;
        for (const beat of due.beats) {
          if (clock.audio) {
            const node = playClick(clock.audio, beat.time, beat.accent);
            queued.add(node);
            at(beat.time + CLICK_DURATION_S, () => queued.delete(node));
          }
          // Visuals follow the same clock, so they stay in step with the click
          at(beat.time + visualDelay, () => beats.set(beat));
        }
        if (countInEnd !== null && countInEnd < horizon) {
          at(countInEnd + visualDelay, () => onCountInEndRef.current?.());
          countInEnd = null;
        }
        if (end !== null && end < horizon) {
          at(end + visualDelay, () => {
            beats.set(null);
            setRun(null);
          });
          end = null;
        }
      };
      tick();
      timer = setInterval(tick, TIMER_INTERVAL_MS);
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      for (const id of pending) clearTimeout(id);
      for (const node of queued) node.disconnect();
      beats.set(null);
    };
  }, [run, bpm, perBar, audioEnabled, beats]);

  useEffect(
    () => () => {
      void audioRef.current?.close().catch(() => undefined);
      audioRef.current = null;
    },
    [],
  );

  return {
    /** Undefined when the song has no usable tempo: the chip hides. */
    bpm: isPlayableBpm(bpm) ? bpm : undefined,
    beatsPerBar: perBar,
    /** Pulse or count-in running. */
    active,
    audioEnabled,
    toggle,
    countIn,
    toggleAudio,
    beats,
  };
}

export type Tempo = ReturnType<typeof useTempo>;
