import { dismissOnboarding } from "@domain/onboarding";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../hooks/use-focus-trap";

const STEPS = ["welcome", "profile", "sync", "band", "install"] as const;
type Step = (typeof STEPS)[number];

interface GettingStartedModalProps {
  onClose: () => void;
}

export function GettingStartedModal({ onClose }: GettingStartedModalProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true);
  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleNext = useCallback(() => {
    if (isLast) {
      dismissOnboarding();
      onClose();
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [isLast, onClose]);

  const handleBack = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl bg-bg p-6 shadow-xl"
      >
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={[
                "h-2 w-2 rounded-full transition-colors",
                i === stepIndex ? "bg-accent" : "bg-border",
              ].join(" ")}
            />
          ))}
        </div>

        {/* Step content */}
        <div>
          <h2 className="mb-2 text-lg font-bold">{t(`onboarding.steps.${step}.title`)}</h2>
          <p className="text-sm text-text-muted">{t(`onboarding.steps.${step}.body`)}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">
            {t("onboarding.skip")}
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button type="button" onClick={handleBack} className="btn btn-ghost text-sm">
                {t("common.back")}
              </button>
            )}
            <button type="button" onClick={handleNext} className="btn btn-primary text-sm">
              {isLast ? t("onboarding.done") : t("onboarding.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
