import { openProfileDb } from "@db";
import { requestAccessToken } from "@domain/google-auth";
import {
  applyInvite,
  clearInviteParam,
  decodeInvite,
  extractInviteParam,
  type InvitePayload,
} from "@domain/invite";
import { createGitHubAdapter } from "@domain/sync/adapters/github";
import { createGoogleDriveAdapter } from "@domain/sync/adapters/google-drive";
import { loadSyncConfig } from "@domain/sync/config";
import { sync } from "@domain/sync/orchestrator";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

type Status =
  | { type: "idle"; payload: InvitePayload }
  | { type: "joining" }
  | { type: "success" }
  | { type: "error"; message: string };

export function JoinPrompt() {
  const { t } = useTranslation();

  // Extract invite param eagerly during render (before the Home→Catalog
  // redirect strips the query string).
  const [status, setStatus] = useState<Status | null>(() => {
    const encoded = extractInviteParam();
    if (!encoded) return null;
    const payload = decodeInvite(encoded);
    if (!payload) {
      clearInviteParam();
      return null;
    }
    return { type: "idle", payload };
  });

  const handleJoin = useCallback(async () => {
    if (!status || status.type !== "idle") return;
    const { payload } = status;

    setStatus({ type: "joining" });
    try {
      const profileId = applyInvite(payload);
      clearInviteParam();

      // Trigger first sync
      const config = loadSyncConfig(profileId);
      if (config) {
        const db = openProfileDb(profileId);
        if (config.adapter === "github") {
          const adapter = createGitHubAdapter(config);
          await sync(adapter, db, profileId);
        } else if (config.adapter === "google-drive") {
          await requestAccessToken();
          const adapter = createGoogleDriveAdapter(config);
          await sync(adapter, db, profileId);
        }
      }

      setStatus({ type: "success" });

      // Navigate to catalog after a brief moment
      setTimeout(() => Router.replace("Catalog"), 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ type: "error", message });
    }
  }, [status]);

  const handleCancel = useCallback(() => {
    clearInviteParam();
    setStatus(null);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!status) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status.type === "idle") handleCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  if (!status) return null;

  const bandName = status.type === "idle" ? status.payload.profile.name : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-bg p-6 shadow-xl">
        {status.type === "idle" && (
          <>
            <h2 className="text-lg font-bold">{t("invite.joinTitle", { name: bandName })}</h2>
            <p className="text-sm text-text-muted">{t("invite.joinMessage")}</p>
            <div className="flex gap-3">
              <button type="button" onClick={handleJoin} className="btn btn-primary flex-1">
                {t("invite.join")}
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-ghost flex-1">
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}

        {status.type === "joining" && (
          <p className="text-sm text-text-muted">{t("invite.joining")}</p>
        )}

        {status.type === "success" && (
          <p className="text-sm text-accent">{t("invite.joinSuccess")}</p>
        )}

        {status.type === "error" && (
          <>
            <p className="text-sm text-danger">
              {t("invite.joinFailed", { error: status.message })}
            </p>
            <button
              type="button"
              onClick={() => setStatus(null)}
              className="btn btn-ghost self-end"
            >
              {t("common.close")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
