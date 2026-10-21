import { useCallback, useEffect, useRef } from "react";
import { flushSync } from "react-dom";

interface UseSwipeStripOptions {
  currentIndex: number;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  totalItems: number;
  onToggleChrome: () => void;
  enabled: boolean;
  onDoubleTapScale?: (direction: "up" | "down") => void;
  doubleTapScaleEnabled?: boolean;
}

const DEAD_ZONE = 8;
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 300;
const COMMIT_RATIO = 0.25;
const RUBBER_BAND = 0.2;

/** Swipe (touch) or drag (mouse, pen) between songs; a tap toggles the chrome. */
export function useSwipeStrip(options: UseSwipeStripOptions) {
  const {
    currentIndex,
    setCurrentIndex,
    totalItems,
    onToggleChrome,
    enabled,
    onDoubleTapScale,
    doubleTapScaleEnabled,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const currentPanelRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);
  const pointerState = useRef<{
    phase: "idle" | "pending" | "swiping" | "scrolling";
    pointerId: number;
    startX: number;
    startY: number;
  }>({ phase: "idle", pointerId: -1, startX: 0, startY: 0 });

  // Keep mutable refs in sync for use inside imperative event handlers
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const totalItemsRef = useRef(totalItems);
  totalItemsRef.current = totalItems;
  const onToggleChromeRef = useRef(onToggleChrome);
  onToggleChromeRef.current = onToggleChrome;
  const onDoubleTapScaleRef = useRef(onDoubleTapScale);
  onDoubleTapScaleRef.current = onDoubleTapScale;
  const doubleTapScaleEnabledRef = useRef(doubleTapScaleEnabled);
  doubleTapScaleEnabledRef.current = doubleTapScaleEnabled;
  const lastTapRef = useRef<{ time: number; zone: "left" | "right" } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideTo = useCallback(
    (direction: "prev" | "next", duration: string) => {
      const strip = stripRef.current;
      const container = containerRef.current;
      if (!strip || !container) return;

      animatingRef.current = true;
      const width = container.offsetWidth;
      strip.style.transition = `transform ${duration} ease-out`;
      strip.style.transform = `translateX(${direction === "prev" ? width : -width}px)`;

      strip.addEventListener(
        "transitionend",
        () => {
          strip.style.transition = "none";
          strip.style.transform = "translateX(0)";
          flushSync(() => {
            setCurrentIndex((i) => (direction === "prev" ? i - 1 : i + 1));
          });
          animatingRef.current = false;
        },
        { once: true },
      );
    },
    [setCurrentIndex],
  );

  const commitSlide = useCallback(
    (direction: "prev" | "next") => {
      if (animatingRef.current) return;
      const idx = currentIndexRef.current;
      if (direction === "prev" && idx === 0) return;
      if (direction === "next" && idx >= totalItemsRef.current - 1) return;
      slideTo(direction, "0.25s");
    },
    [slideTo],
  );

  const goPrev = useCallback(() => commitSlide("prev"), [commitSlide]);
  const goNext = useCallback(() => commitSlide("next"), [commitSlide]);

  // Keyboard / pedal navigation lives in usePerformKeys

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps trigger re-attach when container DOM appears after loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reset = () => {
      pointerState.current = { phase: "idle", pointerId: -1, startX: 0, startY: 0 };
    };

    const snapBack = () => {
      const strip = stripRef.current;
      if (!strip) return;
      strip.style.transition = "transform 0.2s ease-out";
      strip.style.transform = "translateX(0)";
    };

    const handleTap = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-chord-tap], button, a, input, textarea, select")) return;

      if (!doubleTapScaleEnabledRef.current) {
        onToggleChromeRef.current();
        return;
      }

      const rect = el.getBoundingClientRect();
      const zone = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
      const now = Date.now();
      const prev = lastTapRef.current;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (prev && now - prev.time < DOUBLE_TAP_MS && prev.zone === zone) {
        onDoubleTapScaleRef.current?.(zone === "right" ? "up" : "down");
        lastTapRef.current = null;
        return;
      }
      lastTapRef.current = { time: now, zone };
      tapTimerRef.current = setTimeout(() => {
        onToggleChromeRef.current();
        lastTapRef.current = null;
      }, DOUBLE_TAP_MS);
    };

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0 || animatingRef.current) return;
      pointerState.current = {
        phase: "pending",
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };
      if (stripRef.current) stripRef.current.style.transition = "none";
    };

    const onMove = (e: PointerEvent) => {
      const state = pointerState.current;
      if (e.pointerId !== state.pointerId) return;
      if (state.phase === "idle" || state.phase === "scrolling") return;

      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;

      if (state.phase === "pending") {
        if (Math.abs(dx) < DEAD_ZONE && Math.abs(dy) < DEAD_ZONE) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          state.phase = "scrolling";
          return;
        }
        state.phase = "swiping";
        // Captured only once swiping, so a plain click still reaches its button
        el.setPointerCapture(e.pointerId);
      }

      e.preventDefault();

      const idx = currentIndexRef.current;
      let offset = dx;
      if (dx > 0 && idx === 0) offset = dx * RUBBER_BAND;
      if (dx < 0 && idx >= totalItemsRef.current - 1) offset = dx * RUBBER_BAND;

      if (stripRef.current) {
        stripRef.current.style.transform = `translateX(${offset}px)`;
      }
    };

    const onUp = (e: PointerEvent) => {
      const state = pointerState.current;
      if (e.pointerId !== state.pointerId) return;
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;

      if (state.phase === "swiping") {
        const threshold = el.offsetWidth * COMMIT_RATIO;
        const idx = currentIndexRef.current;
        if (dx > threshold && idx > 0) slideTo("prev", "0.2s");
        else if (dx < -threshold && idx < totalItemsRef.current - 1) slideTo("next", "0.2s");
        else snapBack();
      } else if (state.phase === "pending" && Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) {
        handleTap(e);
      }

      reset();
    };

    // The browser took the gesture for a vertical scroll
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerState.current.pointerId) return;
      if (pointerState.current.phase === "swiping") snapBack();
      reset();
    };

    const onDragStart = (e: DragEvent) => e.preventDefault();

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("dragstart", onDragStart);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("dragstart", onDragStart);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, [enabled]);

  // Scroll current panel to top on song change
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the intentional trigger
  useEffect(() => {
    currentPanelRef.current?.scrollTo(0, 0);
  }, [currentIndex]);

  return { containerRef, stripRef, currentPanelRef, goPrev, goNext };
}
