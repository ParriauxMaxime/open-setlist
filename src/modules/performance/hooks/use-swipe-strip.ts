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
  const lastTouchRef = useRef(0);
  const touchState = useRef<{
    phase: "idle" | "pending" | "swiping" | "scrolling";
    startX: number;
    startY: number;
  }>({ phase: "idle", startX: 0, startY: 0 });

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
  const lastTapRef = useRef<{ time: number; zone: "left" | "right" | "other" } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate strip to target, then commit index change
  const commitSlide = useCallback(
    (direction: "prev" | "next") => {
      const strip = stripRef.current;
      const container = containerRef.current;
      if (!strip || !container || animatingRef.current) return;

      const idx = currentIndexRef.current;
      if (direction === "prev" && idx === 0) return;
      if (direction === "next" && idx >= totalItemsRef.current - 1) return;

      animatingRef.current = true;
      const width = container.offsetWidth;
      strip.style.transition = "transform 0.25s ease-out";
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

  const goPrev = useCallback(() => commitSlide("prev"), [commitSlide]);
  const goNext = useCallback(() => commitSlide("next"), [commitSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onToggleChromeRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goPrev, goNext]);

  // Imperative touch handlers on the container (passive: false for preventDefault)
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps trigger re-attach when container DOM appears after loading
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      if (animatingRef.current) return;
      lastTouchRef.current = Date.now();
      const t = e.touches[0];
      touchState.current = { phase: "pending", startX: t.clientX, startY: t.clientY };
      if (stripRef.current) stripRef.current.style.transition = "none";
    };

    const onMove = (e: TouchEvent) => {
      const state = touchState.current;
      if (state.phase === "idle" || state.phase === "scrolling") return;

      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;

      if (state.phase === "pending") {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          state.phase = "scrolling";
          return;
        }
        state.phase = "swiping";
      }

      e.preventDefault();

      // Rubber band at edges
      const idx = currentIndexRef.current;
      let offset = dx;
      if (dx > 0 && idx === 0) offset = dx * 0.2;
      if (dx < 0 && idx >= totalItemsRef.current - 1) offset = dx * 0.2;

      if (stripRef.current) {
        stripRef.current.style.transform = `translateX(${offset}px)`;
      }
    };

    const onEnd = (e: TouchEvent) => {
      const state = touchState.current;
      const t = e.changedTouches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;

      if (state.phase === "swiping") {
        const strip = stripRef.current;
        if (!strip) return;

        const width = el.offsetWidth;
        const threshold = width * 0.25;
        const idx = currentIndexRef.current;

        strip.style.transition = "transform 0.2s ease-out";

        if (dx > threshold && idx > 0) {
          // Commit prev
          animatingRef.current = true;
          strip.style.transform = `translateX(${width}px)`;
          strip.addEventListener(
            "transitionend",
            () => {
              strip.style.transition = "none";
              strip.style.transform = "translateX(0)";
              flushSync(() => setCurrentIndex((i) => i - 1));
              animatingRef.current = false;
            },
            { once: true },
          );
        } else if (dx < -threshold && idx < totalItemsRef.current - 1) {
          // Commit next
          animatingRef.current = true;
          strip.style.transform = `translateX(-${width}px)`;
          strip.addEventListener(
            "transitionend",
            () => {
              strip.style.transition = "none";
              strip.style.transform = "translateX(0)";
              flushSync(() => setCurrentIndex((i) => i + 1));
              animatingRef.current = false;
            },
            { once: true },
          );
        } else {
          // Snap back
          strip.style.transform = "translateX(0)";
        }
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-chord-tap]")) {
          const rect = el.getBoundingClientRect();
          const zone: "left" | "right" = t.clientX < rect.left + rect.width / 2 ? "left" : "right";

          if (doubleTapScaleEnabledRef.current) {
            const now = Date.now();
            const prev = lastTapRef.current;
            if (prev && now - prev.time < 300 && prev.zone === zone) {
              if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
              onDoubleTapScaleRef.current?.(zone === "right" ? "up" : "down");
              lastTapRef.current = null;
            } else {
              lastTapRef.current = { time: now, zone };
              if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
              tapTimerRef.current = setTimeout(() => {
                onToggleChromeRef.current();
                lastTapRef.current = null;
              }, 300);
            }
          } else {
            onToggleChromeRef.current();
          }
        }
      }

      touchState.current = { phase: "idle", startX: 0, startY: 0 };
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, [enabled]);

  // Scroll current panel to top on song change
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the intentional trigger
  useEffect(() => {
    currentPanelRef.current?.scrollTo(0, 0);
  }, [currentIndex]);

  // Desktop click — ignore if a touch just happened
  const handleClick = useCallback(() => {
    if (Date.now() - lastTouchRef.current < 400) return;
    onToggleChromeRef.current();
  }, []);

  return { containerRef, stripRef, currentPanelRef, goPrev, goNext, handleClick };
}
