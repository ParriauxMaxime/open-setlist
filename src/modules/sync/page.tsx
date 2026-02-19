import { useDb } from "@db/provider";
import { exportSnapshot, importSnapshot } from "@db/snapshot";
import { useActiveProfileId } from "@domain/profiles";
import { fileAdapter } from "@domain/sync/adapters/file";
import { createGitHubAdapter } from "@domain/sync/adapters/github";
import { loadSyncConfig } from "@domain/sync/config";
import type { ChangeItem } from "@domain/sync/diff";
import {
  pullAndDiff,
  pushSelected,
  type SyncResult,
  type SyncReviewContext,
} from "@domain/sync/orchestrator";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { GitHubIcon } from "../design-system/components/icons";
import { SETTINGS_SCROLL_KEY } from "../settings/page";
import { SyncReview } from "./components/sync-review";

type Status =
  | { type: "idle" }
  | { type: "exporting" }
  | { type: "importing" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type GitHubStatus =
  | { type: "idle" }
  | { type: "pulling" }
  | { type: "review"; ctx: SyncReviewContext }
  | { type: "pushing" }
  | { type: "success"; result: SyncResult }
  | { type: "error"; message: string };

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "< 1 min";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function SyncPage() {
  const { t } = useTranslation();
  const db = useDb();
  const profileId = useActiveProfileId();
  const songCount = useLiveQuery(() => db.songs.count(), [db]) ?? 0;
  const setlistCount = useLiveQuery(() => db.setlists.count(), [db]) ?? 0;
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [confirmImport, setConfirmImport] = useState(false);
  const [ghStatus, setGhStatus] = useState<GitHubStatus>({ type: "idle" });

  const syncConfig = loadSyncConfig(profileId);
  const ghConfigured = syncConfig?.adapter === "github";

  // Step 1: Pull + diff
  const handleGitHubSync = useCallback(async () => {
    const config = loadSyncConfig(profileId);
    if (!config || config.adapter !== "github") return;
    setGhStatus({ type: "pulling" });
    try {
      const adapter = createGitHubAdapter(config);
      const result = await pullAndDiff(adapter, db, profileId);
      if ("status" in result) {
        setGhStatus({ type: "success", result });
      } else {
        setGhStatus({ type: "review", ctx: result });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setGhStatus({ type: "error", message });
    }
  }, [db, profileId]);

  // Step 2: Push selected
  const handlePushSelected = useCallback(
    async (selectedOutgoing: ChangeItem[]) => {
      if (ghStatus.type !== "review") return;
      const config = loadSyncConfig(profileId);
      if (!config || config.adapter !== "github") return;
      setGhStatus({ type: "pushing" });
      try {
        const adapter = createGitHubAdapter(config);
        const result = await pushSelected(adapter, db, profileId, ghStatus.ctx, selectedOutgoing);
        setGhStatus({ type: "success", result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setGhStatus({ type: "error", message });
      }
    },
    [ghStatus, db, profileId],
  );

  const handleExport = useCallback(async () => {
    setStatus({ type: "exporting" });
    try {
      const snapshot = await exportSnapshot(db, profileId);
      await fileAdapter.push(snapshot);
      setStatus({ type: "success", message: t("sync.exportSuccess") });
    } catch {
      setStatus({ type: "error", message: t("sync.exportFailed") });
    }
  }, [t, db, profileId]);

  const handleImport = useCallback(async () => {
    setStatus({ type: "importing" });
    setConfirmImport(false);
    try {
      const snapshot = await fileAdapter.pull();
      await importSnapshot(db, snapshot);
      setStatus({
        type: "success",
        message: t("sync.importSuccess", {
          songs: snapshot.songs.length,
          setlists: snapshot.setlists.length,
        }),
      });
    } catch (err) {
      // User cancelled the file picker
      if (err instanceof DOMException) {
        setStatus({ type: "idle" });
        return;
      }
      const message = err instanceof Error ? err.message : t("sync.importFailed");
      setStatus({ type: "error", message });
    }
  }, [t, db]);

  const busy = status.type === "exporting" || status.type === "importing";

  return (
    <div className="p-page">
      <h1 className="mb-4 text-2xl font-bold">{t("sync.title")}</h1>

      <p className="mb-4 text-text-muted">{t("sync.description")}</p>

      <p className="mb-6 text-sm text-text-muted">
        {t("sync.songCount", { count: songCount })},{" "}
        {t("sync.setlistCount", { count: setlistCount })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleExport} disabled={busy} className="btn btn-primary">
          {status.type === "exporting" ? t("sync.exporting") : t("sync.exportToFile")}
        </button>

        {confirmImport ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-danger">{t("sync.replaceConfirm")}</span>
            <button
              type="button"
              onClick={handleImport}
              disabled={busy}
              className="btn-danger font-medium hover:underline"
            >
              {t("sync.yesImport")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmImport(false)}
              className="link hover:underline"
            >
              {t("common.cancel")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmImport(true)}
            disabled={busy}
            className="btn btn-ghost"
          >
            {status.type === "importing" ? t("sync.importing") : t("sync.importFile")}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {status.type === "success" && <p className="mt-4 text-sm text-accent">{status.message}</p>}
        {status.type === "error" && <p className="mt-4 text-sm text-danger">{status.message}</p>}
      </div>

      <p className="mt-6 text-xs text-text-faint">{t("sync.importNote")}</p>

      {/* GitHub sync section */}
      <hr className="my-6 border-border" />

      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <GitHubIcon className="h-5 w-5" />
        GitHub
      </h2>

      {!ghConfigured ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-text-muted">{t("sync.github.notConfigured")}</p>
          <Link
            to={Router.Settings()}
            onClick={() => sessionStorage.setItem(SETTINGS_SCROLL_KEY, "github")}
            className="link-accent text-sm"
          >
            {t("sync.github.goToSettings")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Review mode */}
          {ghStatus.type === "review" ? (
            <SyncReview
              diff={ghStatus.ctx.diff}
              onConfirm={handlePushSelected}
              onCancel={() => setGhStatus({ type: "idle" })}
              busy={false}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGitHubSync}
                  disabled={ghStatus.type === "pulling" || ghStatus.type === "pushing"}
                  className="btn btn-primary"
                >
                  {ghStatus.type === "pulling"
                    ? "Pulling..."
                    : ghStatus.type === "pushing"
                      ? "Pushing..."
                      : t("sync.github.sync")}
                </button>

                {syncConfig.lastSyncedAt && ghStatus.type === "idle" && (
                  <span className="text-sm text-text-muted">
                    {t("sync.github.lastSync", { time: formatTimeAgo(syncConfig.lastSyncedAt) })}
                  </span>
                )}
              </div>

              <div aria-live="polite">
                {ghStatus.type === "success" && (
                  <p className="text-sm text-accent">
                    {ghStatus.result.status === "created"
                      ? t("sync.github.syncCreated", {
                          songs: ghStatus.result.songCount,
                          setlists: ghStatus.result.setlistCount,
                        })
                      : ghStatus.result.status === "up-to-date"
                        ? "Everything is up to date."
                        : t("sync.github.syncSuccess", {
                            songs: ghStatus.result.songCount,
                            setlists: ghStatus.result.setlistCount,
                          })}
                  </p>
                )}

                {ghStatus.type === "error" && (
                  <p className="text-sm text-danger">
                    {t("sync.github.syncFailed", { error: ghStatus.message })}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
