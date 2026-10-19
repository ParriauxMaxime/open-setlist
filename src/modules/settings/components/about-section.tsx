import Dexie from "dexie";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../../design-system/components/confirm-modal";
import { WhatsNewCard } from "../../shared/components/whats-new-card";
import { SettingRow, SettingsGroup } from "./setting-row";

/** What the app is, what changed lately, and the one button that wipes this device. */
export function AboutSection() {
  const { t } = useTranslation();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleFullReset = async () => {
    setShowResetConfirm(false);
    const databases = await Dexie.getDatabaseNames();
    await Promise.all(databases.map((name) => Dexie.delete(name)));
    localStorage.clear();
    window.location.reload();
  };

  return (
    <>
      <p className="mb-6 whitespace-pre-line text-sm text-text-muted">
        {t("onboarding.about.body")}
      </p>
      <WhatsNewCard className="mb-6" />

      <SettingsGroup title={t("settings.danger.heading")} danger>
        <SettingRow
          label={t("onboarding.about.resetTitle")}
          description={t("onboarding.about.resetMessage")}
        >
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="btn btn-danger btn-sm"
          >
            {t("settings.danger.reset")}
          </button>
        </SettingRow>
      </SettingsGroup>

      <p className="text-xs text-text-faint">{t("onboarding.about.version")}</p>

      {showResetConfirm && (
        <ConfirmModal
          title={t("onboarding.about.resetTitle")}
          message={t("onboarding.about.resetMessage")}
          confirmLabel={t("onboarding.about.resetConfirm")}
          onConfirm={handleFullReset}
          onCancel={() => setShowResetConfirm(false)}
          variant="danger"
        />
      )}
    </>
  );
}
