import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const DISMISS_KEY = "open-setlist-perform-hints-seen";

function isSeen(): boolean {
  return localStorage.getItem(DISMISS_KEY) === "1";
}

function markSeen(): void {
  localStorage.setItem(DISMISS_KEY, "1");
}

interface PerformHintsProps {
  /** Asked for from the menu: every gesture and shortcut, not only the three to start with. */
  showAll: boolean;
  onClose: () => void;
}

/** The three gestures a musician needs, shown once; the full list is one tap away in the menu. */
export function PerformHints({ showAll, onClose }: PerformHintsProps) {
  const { t } = useTranslation();
  const [firstTime, setFirstTime] = useState(() => !isSeen());
  const visible = firstTime || showAll;

  const dismiss = useCallback(() => {
    markSeen();
    setFirstTime(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, dismiss]);

  if (!visible) return null;

  const essentials = [
    { icon: "👆", text: t("perform.hints.tap") },
    { icon: "👈 👉", text: t("perform.hints.swipe") },
    { icon: "⌨️", text: t("perform.hints.page") },
  ];
  const more = [
    { icon: "👆👆", text: t("perform.hints.doubleTap") },
    { icon: "♩", text: t("performTempo.hint") },
    { icon: "⋮", text: t("perform.hints.myPart") },
    { icon: "⌨️", text: t("performStage.hintPedal") },
    { icon: "S", text: t("performStage.hintAutoScroll") },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("perform.help")}
        className="flex max-h-full w-full max-w-md flex-col gap-5 overflow-y-auto rounded-xl bg-bg-surface p-6 shadow-xl"
      >
        <ul className="flex flex-col gap-4">
          {(showAll ? [...essentials.slice(0, 2), ...more] : essentials).map((hint) => (
            <li key={hint.text} className="flex items-center gap-4">
              <span className="w-14 shrink-0 text-center text-2xl text-text">{hint.icon}</span>
              <span className={showAll ? "text-base text-text" : "text-lg text-text"}>
                {hint.text}
              </span>
            </li>
          ))}
        </ul>
        {!showAll && <p className="text-sm text-text-muted">{t("perform.hints.more")}</p>}
        <button type="button" onClick={dismiss} className="btn btn-primary min-h-12 text-base">
          {t("perform.hints.dismiss")}
        </button>
      </div>
    </div>
  );
}
