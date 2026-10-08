import {
  defaultScrollSpeed,
  SCROLL_SPEED_DEFAULT,
  scrollSpeedToPxPerSecond,
} from "@domain/perform-stage";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseAutoScrollOptions {
  panelRef: RefObject<HTMLDivElement | null>;
  /** Changes when the displayed song changes — stops auto-scroll. */
  songKey: string | undefined;
  /** Explicit per-song speed (1–10), or undefined to derive it. */
  scrollSpeed: number | undefined;
  /** Song duration in seconds, used to derive the default speed. */
  duration: number | undefined;
}

// A scrollTop jump larger than this between frames means someone else scrolled
const EXTERNAL_SCROLL_THRESHOLD = 4;

export function useAutoScroll({ panelRef, songKey, scrollSpeed, duration }: UseAutoScrollOptions) {
  const [active, setActive] = useState(false);
  const [derivedSpeed, setDerivedSpeed] = useState<number | null>(null);

  // Speed in levels, read every frame so +/- applies without restarting the loop
  const speed = scrollSpeed ?? derivedSpeed;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const stop = useCallback(() => setActive(false), []);

  // Derive the default from the current layout; content height depends on
  // font scale, so recompute when the song changes or playback starts.
  const deriveSpeed = useCallback(() => {
    const el = panelRef.current;
    const distance = el ? el.scrollHeight - el.clientHeight : 0;
    const level = defaultScrollSpeed(duration, distance);
    setDerivedSpeed(level);
    return level;
  }, [panelRef, duration]);

  const activeRef = useRef(active);
  activeRef.current = active;
  const toggle = useCallback(() => {
    if (activeRef.current) {
      setActive(false);
      return;
    }
    if (scrollSpeed === undefined) speedRef.current = deriveSpeed();
    setActive(true);
  }, [scrollSpeed, deriveSpeed]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: songKey is the intentional trigger
  useEffect(() => {
    setActive(false);
  }, [songKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: songKey is the intentional trigger
  useEffect(() => {
    deriveSpeed();
  }, [songKey, deriveSpeed]);

  useEffect(() => {
    const el = panelRef.current;
    if (!active || !el) return;

    // Track position as a float — scrollTop rounds, which would stall slow speeds
    let position = el.scrollTop;
    let lastTime: number | null = null;
    let frame = 0;

    const tick = (now: number) => {
      if (Math.abs(el.scrollTop - position) > EXTERNAL_SCROLL_THRESHOLD) {
        setActive(false);
        return;
      }
      const maxTop = el.scrollHeight - el.clientHeight;
      if (lastTime !== null) {
        // Cap the step so a stalled frame (e.g. tab hidden) doesn't jump the page
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        position = Math.min(
          maxTop,
          position + scrollSpeedToPxPerSecond(speedRef.current ?? SCROLL_SPEED_DEFAULT) * dt,
        );
        el.scrollTop = position;
      }
      lastTime = now;
      if (position >= maxTop - 1) {
        setActive(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    // Any manual interaction with the song pauses auto-scroll
    const onManual = () => setActive(false);
    el.addEventListener("touchstart", onManual, { passive: true });
    el.addEventListener("wheel", onManual, { passive: true });
    el.addEventListener("mousedown", onManual);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("touchstart", onManual);
      el.removeEventListener("wheel", onManual);
      el.removeEventListener("mousedown", onManual);
    };
  }, [active, panelRef]);

  return { active, toggle, stop, speed, isDerived: scrollSpeed === undefined };
}
