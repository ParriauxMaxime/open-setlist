import {
  computeScrollStep,
  isEditableTarget,
  keyToPerformAction,
  PerformAction,
} from "@domain/perform-stage";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

interface UsePerformKeysOptions {
  panelRef: RefObject<HTMLDivElement | null>;
  goPrev: () => void;
  goNext: () => void;
  onToggleChrome: () => void;
  onToggleAutoScroll: () => void;
  /** Called on any page-turn / song-change key so auto-scroll yields to the pedal. */
  onManualNavigation: () => void;
}

/** Keyboard and Bluetooth page-turner pedal handling for performance mode. */
export function usePerformKeys(options: UsePerformKeysOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target as HTMLElement | null)) return;
      const action = keyToPerformAction(e);
      if (!action) return;

      const { panelRef, goPrev, goNext, onToggleChrome, onToggleAutoScroll, onManualNavigation } =
        optionsRef.current;

      switch (action) {
        case PerformAction.Forward:
        case PerformAction.Back: {
          e.preventDefault();
          onManualNavigation();
          const el = panelRef.current;
          if (!el) return;
          const step = computeScrollStep(el, action === PerformAction.Forward ? "forward" : "back");
          if (step.type === "scroll") {
            el.scrollTo({
              top: step.top,
              behavior: prefersReducedMotion.matches ? "auto" : "smooth",
            });
          } else if (!e.repeat) {
            // Holding a key scrolls to the edge but never skips to another song
            if (action === PerformAction.Forward) goNext();
            else goPrev();
          }
          return;
        }
        case PerformAction.NextSong:
        case PerformAction.PrevSong:
          e.preventDefault();
          if (e.repeat) return;
          onManualNavigation();
          if (action === PerformAction.NextSong) goNext();
          else goPrev();
          return;
        case PerformAction.ToggleAutoScroll:
          e.preventDefault();
          if (!e.repeat) onToggleAutoScroll();
          return;
        case PerformAction.ToggleChrome:
          onToggleChrome();
          return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
