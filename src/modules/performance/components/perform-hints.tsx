import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const DISMISS_KEY = "open-setlist-perform-hints-seen";

function isSeen(): boolean {
  return localStorage.getItem(DISMISS_KEY) === "1";
}

function markSeen(): void {
  localStorage.setItem(DISMISS_KEY, "1");
}

export function PerformHints() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => !isSeen());

  const dismiss = useCallback(() => {
    markSeen();
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="fixed inset-0 z-50 flex cursor-default items-stretch border-0 bg-black/70"
      onClick={dismiss}
    >
      {/* Left side — zoom out zone */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 border-r border-white/10">
        <span className="text-2xl">👆👆</span>
        <p className="text-xs text-white/80">{t("perform.hints.doubleTapLeft")}</p>
      </div>

      {/* Center column — tap + swipe hints */}
      <div className="flex flex-col items-center justify-center gap-8 px-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-3xl">👆</span>
          <p className="text-sm font-medium text-white">{t("perform.hints.tap")}</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl">👈 👉</span>
          <p className="text-xs text-white/80">{t("perform.hints.swipe")}</p>
        </div>
        <div className="flex max-w-56 flex-col items-center gap-2 text-center">
          <span className="text-2xl text-white">♩</span>
          <p className="text-xs text-white/80">{t("performTempo.hint")}</p>
          <p className="text-xs text-white/80">{t("perform.hints.myPart")}</p>
        </div>
        <div className="flex max-w-56 flex-col items-center gap-1 text-center">
          <span className="text-2xl">⌨️</span>
          <p className="text-xs text-white/80">{t("performStage.hintPedal")}</p>
          <p className="text-xs text-white/80">{t("performStage.hintAutoScroll")}</p>
        </div>
        <p className="text-xs text-white/50">{t("perform.hints.dismiss")}</p>
      </div>

      {/* Right side — zoom in zone */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 border-l border-white/10">
        <span className="text-2xl">👆👆</span>
        <p className="text-xs text-white/80">{t("perform.hints.doubleTapRight")}</p>
      </div>
    </button>
  );
}
