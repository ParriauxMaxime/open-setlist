import { useCallback, useEffect, useRef, useState } from "react";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

interface PitchState {
  note: string | null;
  frequency: number | null;
  cents: number | null;
  listening: boolean;
  error: string | null;
}

function midiToNoteName(midi: number): string {
  const noteIndex = Math.round(midi) % 12;
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  // RMS check — skip silence
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return null;

  // Normalized autocorrelation
  const minLag = Math.floor(sampleRate / 1200); // ~1200 Hz upper bound
  const maxLag = Math.ceil(sampleRate / 60); // ~60 Hz lower bound
  const corr = new Float32Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < buffer.length - maxLag; i++) {
      sum += buffer[i] * buffer[i + lag];
      norm1 += buffer[i] * buffer[i];
      norm2 += buffer[i + lag] * buffer[i + lag];
    }
    const norm = Math.sqrt(norm1 * norm2);
    corr[lag] = norm > 0 ? sum / norm : 0;
  }

  // Find first dip below 0.5, then first peak above 0.8
  let foundDip = false;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (!foundDip) {
      if (corr[lag] < 0.5) foundDip = true;
      continue;
    }
    if (corr[lag] > 0.8) {
      // Walk to peak
      while (lag + 1 <= maxLag && corr[lag + 1] > corr[lag]) {
        lag++;
      }

      // Parabolic interpolation
      const prev = lag > minLag ? corr[lag - 1] : corr[lag];
      const curr = corr[lag];
      const next = lag < maxLag ? corr[lag + 1] : corr[lag];
      const shift = (prev - next) / (2 * (prev - 2 * curr + next));
      const refinedLag = lag + (Number.isFinite(shift) ? shift : 0);

      return sampleRate / refinedLag;
    }
  }

  return null;
}

export function usePitch() {
  const [state, setState] = useState<PitchState>({
    note: null,
    frequency: null,
    cents: null,
    listening: false,
    error: null,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = audioCtxRef.current;
    if (!analyser || !ctx) return;

    const now = performance.now();
    if (now - lastFrameRef.current < 33) {
      // ~30fps throttle
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    lastFrameRef.current = now;

    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    const freq = detectPitch(buffer, ctx.sampleRate);

    if (freq != null) {
      const midi = 12 * Math.log2(freq / 440) + 69;
      const rounded = Math.round(midi);
      const cents = Math.round((midi - rounded) * 100);

      setState((prev) => ({
        ...prev,
        note: midiToNoteName(rounded),
        frequency: freq,
        cents,
      }));
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null }));

    if (!navigator.mediaDevices?.getUserMedia) {
      setState((prev) => ({ ...prev, error: "micUnsupported" }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      analyserRef.current = analyser;

      setState((prev) => ({ ...prev, listening: true }));
      lastFrameRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setState((prev) => ({ ...prev, error: "micDenied" }));
      } else {
        setState((prev) => ({ ...prev, error: "micError" }));
      }
    }
  }, [tick]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => {
      t.stop();
    });
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setState({ note: null, frequency: null, cents: null, listening: false, error: null });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => {
        t.stop();
      });
      audioCtxRef.current?.close();
    };
  }, []);

  return { ...state, start, stop };
}
