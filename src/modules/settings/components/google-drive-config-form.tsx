import { clearAccessToken, isGoogleDriveAvailable, requestAccessToken } from "@domain/google-auth";
import { showDrivePicker } from "@domain/google-picker";
import { buildInviteUrl, type InvitePayload } from "@domain/invite";
import { loadProfiles } from "@domain/profiles";
import { createDriveFile, createGoogleDriveAdapter } from "@domain/sync/adapters/google-drive";
import { clearSyncConfig, loadSyncConfig, saveSyncConfig } from "@domain/sync/config";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { GoogleDriveIcon } from "../../design-system/components/icons";

type Status =
  | { type: "idle" }
  | { type: "connecting" }
  | { type: "connected"; file: string }
  | { type: "error"; message: string }
  | { type: "disconnected" };

interface GoogleDriveConfigFormProps {
  profileId: string;
  defaultOpen?: boolean;
}

export function GoogleDriveConfigForm({
  profileId,
  defaultOpen = false,
}: GoogleDriveConfigFormProps) {
  const { t } = useTranslation();
  const available = isGoogleDriveAvailable();

  const existing = loadSyncConfig(profileId);
  const isConnected = existing?.adapter === "google-drive";

  const [status, setStatus] = useState<Status>(
    isConnected ? { type: "connected", file: "open-setlist.json" } : { type: "idle" },
  );
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setStatus({ type: "connecting" });
    try {
      const token = await requestAccessToken();

      // If already configured, just test the connection
      const config = loadSyncConfig(profileId);
      if (config?.adapter === "google-drive") {
        const adapter = createGoogleDriveAdapter(config);
        const name = await adapter.testConnection();
        setStatus({ type: "connected", file: name });
        return;
      }

      // Show picker so user can choose folder or existing file
      const picked = await showDrivePicker(token);
      if (!picked) {
        setStatus({ type: "idle" });
        return;
      }

      let fileId: string;
      let fileName: string;

      if (picked.type === "folder") {
        fileId = await createDriveFile(picked.id);
        fileName = "open-setlist.json";
      } else {
        fileId = picked.id;
        fileName = picked.name;
      }

      saveSyncConfig(profileId, {
        adapter: "google-drive",
        fileId,
        lastVersionToken: null,
        lastSyncedAt: null,
      });
      setStatus({ type: "connected", file: fileName });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ type: "error", message });
    }
  }, [profileId]);

  const handleDisconnect = useCallback(() => {
    clearAccessToken();
    clearSyncConfig(profileId);
    setStatus({ type: "disconnected" });
  }, [profileId]);

  const handleInvite = useCallback(async () => {
    const config = loadSyncConfig(profileId);
    if (!config || config.adapter !== "google-drive") return;

    const profile = loadProfiles().find((p) => p.id === profileId);
    const payload: InvitePayload = {
      profile: { name: profile?.name ?? "Band", avatar: profile?.avatar },
      sync: { adapter: "google-drive", fileId: config.fileId },
    };

    const url = buildInviteUrl(payload);

    try {
      await navigator.clipboard.writeText(url);
      setInviteFeedback(t("invite.linkCopied"));

      if (navigator.share) {
        try {
          await navigator.share({ url });
        } catch {
          // User cancelled share — link is still copied
        }
      }
    } catch {
      setInviteFeedback(t("invite.shareFailed"));
    }

    setTimeout(() => setInviteFeedback(null), 3000);
  }, [profileId, t]);

  if (!available) return null;

  return (
    <details
      id="google-drive"
      open={defaultOpen || undefined}
      className="accordion group rounded-md border border-border"
    >
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold select-none">
        <GoogleDriveIcon className="h-4 w-4" />
        {t("settings.googleDrive.heading")}
        {isConnected && (
          <span className="mr-2 rounded-full bg-accent-muted px-2 py-0.5 text-xs text-accent">
            {t("settings.googleDrive.connected")}
          </span>
        )}
      </summary>

      <div className="accordion-content">
        <div className="accordion-inner">
          <div className="flex flex-col gap-4 border-t border-border px-4 py-4">
            <p className="text-sm text-text-muted">{t("settings.googleDrive.desc")}</p>

            <div className="flex flex-wrap items-center gap-3">
              {status.type !== "connected" && (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={status.type === "connecting"}
                  className="btn btn-outline"
                >
                  {status.type === "connecting"
                    ? t("settings.googleDrive.connecting")
                    : t("settings.googleDrive.connect")}
                </button>
              )}
            </div>

            <div aria-live="polite">
              {status.type === "connected" && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-accent">
                    {t("settings.googleDrive.connectedFile", { file: status.file })}
                  </p>
                  <button
                    type="button"
                    onClick={handleInvite}
                    className="btn btn-outline self-start"
                  >
                    {t("invite.inviteMembers")}
                  </button>
                  {inviteFeedback && <p className="text-sm text-accent">{inviteFeedback}</p>}
                </div>
              )}
              {status.type === "error" && (
                <p className="text-sm text-danger">
                  {t("settings.googleDrive.connectionFailed", { error: status.message })}
                </p>
              )}
              {status.type === "disconnected" && (
                <p className="text-sm text-text-muted">{t("settings.googleDrive.disconnected")}</p>
              )}
            </div>

            <p className="text-xs text-text-faint">{t("settings.googleDrive.help")}</p>

            {status.type === "connected" && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="btn btn-danger self-start"
              >
                {t("settings.googleDrive.disconnect")}
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
