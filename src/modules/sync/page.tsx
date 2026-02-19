import { db } from "@db";
import { exportSnapshot, importSnapshot } from "@db/snapshot";
import { fileAdapter } from "@domain/sync/adapters/file";
import { createGitHubAdapter } from "@domain/sync/adapters/github";
import { loadSyncConfig } from "@domain/sync/config";
import { type SyncResult, sync } from "@domain/sync/orchestrator";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { GitHubIcon } from "../design-system/components/icons";
import { SETTINGS_SCROLL_KEY } from "../settings/page";

type Status =
  | { type: "idle" }
  | { type: "exporting" }
  | { type: "importing" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type GitHubStatus =
  | { type: "idle" }
  | { type: "syncing" }
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
  const songCount = useLiveQuery(() => db.songs.count()) ?? 0;
  const setlistCount = useLiveQuery(() => db.setlists.count()) ?? 0;
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [confirmImport, setConfirmImport] = useState(false);
  const [ghStatus, setGhStatus] = useState<GitHubStatus>({ type: "idle" });

  const syncConfig = loadSyncConfig();
  const ghConfigured = syncConfig?.adapter === "github";

  const handleGitHubSync = useCallback(async () => {
    const config = loadSyncConfig();
    if (!config || config.adapter !== "github") return;
    setGhStatus({ type: "syncing" });
    try {
      const adapter = createGitHubAdapter(config);
      const result = await sync(adapter);
      setGhStatus({ type: "success", result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setGhStatus({ type: "error", message });
    }
  }, []);

  const handleExport = useCallback(async () => {
    setStatus({ type: "exporting" });
    try {
      const snapshot = await exportSnapshot();
      await fileAdapter.push(snapshot);
      setStatus({ type: "success", message: t("sync.exportSuccess") });
    } catch {
      setStatus({ type: "error", message: t("sync.exportFailed") });
    }
  }, [t]);

  const handleImport = useCallback(async () => {
    setStatus({ type: "importing" });
    setConfirmImport(false);
    try {
      const snapshot = await fileAdapter.pull();
      await importSnapshot(snapshot);
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
  }, [t]);

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

      {status.type === "success" && <p className="mt-4 text-sm text-accent">{status.message}</p>}

      {status.type === "error" && <p className="mt-4 text-sm text-danger">{status.message}</p>}

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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGitHubSync}
              disabled={ghStatus.type === "syncing"}
              className="btn btn-primary"
            >
              {ghStatus.type === "syncing" ? t("sync.github.syncing") : t("sync.github.sync")}
            </button>

            {syncConfig.lastSyncedAt && ghStatus.type === "idle" && (
              <span className="text-sm text-text-muted">
                {t("sync.github.lastSync", { time: formatTimeAgo(syncConfig.lastSyncedAt) })}
              </span>
            )}
          </div>

          {ghStatus.type === "success" && (
            <p className="text-sm text-accent">
              {ghStatus.result.status === "created"
                ? t("sync.github.syncCreated", {
                    songs: ghStatus.result.songCount,
                    setlists: ghStatus.result.setlistCount,
                  })
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
      )}
    </div>
  );
}
