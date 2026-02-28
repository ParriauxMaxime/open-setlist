import { dismissOnboarding, useOnboardingDismissed } from "@domain/onboarding";
import { useIsDemoProfile } from "@domain/profiles";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { GettingStartedModal } from "./getting-started-modal";

export function GettingStartedBanner() {
  const { t } = useTranslation();
  const isDemo = useIsDemoProfile();
  const dismissed = useOnboardingDismissed();
  const [modalOpen, setModalOpen] = useState(false);

  const handleDismiss = useCallback(() => {
    dismissOnboarding();
  }, []);

  if (!isDemo || dismissed) return null;

  return (
    <>
      <div className="my-2 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-muted px-3 py-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex-1 cursor-pointer text-left"
        >
          <p className="text-sm font-semibold text-accent">{t("onboarding.bannerTitle")}</p>
          <p className="text-xs text-text-muted">{t("onboarding.bannerDesc")}</p>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-0.5 text-text-faint hover:text-text"
          aria-label={t("common.close")}
        >
          {"\u2715"}
        </button>
      </div>
      {modalOpen && <GettingStartedModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
