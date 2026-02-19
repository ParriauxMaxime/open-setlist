import {
  detectPlatform,
  dismiss,
  isDismissed,
  onPwaPromptRequest,
  useInstallPrompt,
} from "@domain/pwa";
import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

export function PwaInstallPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => {
    const p = detectPlatform();
    // Auto-prompt on mobile only; desktop users can open from Settings
    return p !== "standalone" && p !== "desktop" && !isDismissed();
  });
  const platform = detectPlatform();
  const installPrompt = useInstallPrompt();

  // Listen for reopen requests (e.g. from settings page)
  useEffect(() => {
    if (platform === "standalone") return;
    return onPwaPromptRequest(() => setVisible(true));
  }, [platform]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  const handleDismiss = useCallback(() => {
    dismiss();
    setVisible(false);
  }, []);

  const handleInstall = useCallback(async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      handleDismiss();
    }
  }, [installPrompt, handleDismiss]);

  if (!visible || platform === "standalone") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-bg p-6 shadow-xl">
        <h2 className="text-lg font-bold">{t("pwa.title")}</h2>

        {platform === "android-chrome" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">{t("pwa.androidChrome")}</p>
            {installPrompt ? (
              <button type="button" onClick={handleInstall} className="btn btn-primary">
                {t("pwa.install")}
              </button>
            ) : (
              <p className="text-sm text-text-muted">
                <Trans i18nKey="pwa.iosSafari" components={{ strong: <strong /> }} />
              </p>
            )}
          </div>
        )}

        {platform === "ios-safari" && (
          <p className="text-sm text-text-muted">
            <Trans i18nKey="pwa.iosSafari" components={{ strong: <strong /> }} />
          </p>
        )}

        {platform === "ios-other" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-muted">{t("pwa.iosOther")}</p>
            <input
              type="text"
              readOnly
              value={window.location.href}
              className="field text-xs"
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}

        {platform === "desktop" && <p className="text-sm text-text-muted">{t("pwa.desktop")}</p>}

        <button type="button" onClick={handleDismiss} className="btn btn-ghost self-end text-sm">
          {t("pwa.dismiss")}
        </button>
      </div>
    </div>
  );
}
