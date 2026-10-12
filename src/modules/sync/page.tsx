import { useDb } from "@db/provider";
import { exportSnapshot, importSnapshot } from "@db/snapshot";
import { formatTimeAgo } from "@domain/format";
import { isGoogleDriveAvailable, requestAccessToken } from "@domain/google-auth";
import { useActiveProfileId } from "@domain/profiles";
import { fileAdapter } from "@domain/sync/adapters/file";
import { createGitHubAdapter } from "@domain/sync/adapters/github";
import { createGoogleDriveAdapter } from "@domain/sync/adapters/google-drive";
import { loadSyncConfig } from "@domain/sync/config";
import type { TranspositionMismatch } from "@domain/sync/transposition-mismatch";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmModal } from "../design-system/components/confirm-modal";
import { GitHubIcon, GoogleDriveIcon } from "../design-system/components/icons";
import { SETTINGS_SCROLL_KEY } from "../settings/page";
import { FileSyncSummary } from "./components/file-sync-summary";
import { SetlistHelperImport } from "./components/setlist-helper-import";
import { SetlistHelperSetlistImport } from "./components/setlist-helper-setlist-import";
import { SyncReview } from "./components/sync-review";
import { TranspositionAlert } from "./components/transposition-alert";
import { useRemoteSync } from "./hooks/use-remote-sync";

type Status =
  | { type: "idle" }
  | { type: "exporting" }
  | { type: "importing" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export function SyncPage() {
  const { t } = useTranslation();
  const db = useDb();
  const profileId = useActiveProfileId();
  const songCount = useLiveQuery(() => db.songs.count(), [db]) ?? 0;
  const setlistCount = useLiveQuery(() => db.setlists.count(), [db]) ?? 0;
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [confirmImport, setConfirmImport] = useState(false);
  const [transpositionMismatches, setTranspositionMismatches] = useState<TranspositionMismatch[]>(
    [],
  );

  const syncConfig = loadSyncConfig(profileId);
  const ghConfigured = syncConfig?.adapter === "github";
  const gdConfigured = syncConfig?.adapter === "google-drive";

  const github = useRemoteSync({
    createAdapter: () => {
      const config = loadSyncConfig(profileId);
      return config?.adapter === "github" ? createGitHubAdapter(config) : null;
    },
    onTranspositionMismatches: setTranspositionMismatches,
  });
  const googleDrive = useRemoteSync({
    createAdapter: () => {
      const config = loadSyncConfig(profileId);
      return config?.adapter === "google-drive" ? createGoogleDriveAdapter(config) : null;
    },
    prepare: requestAccessToken,
    onTranspositionMismatches: setTranspositionMismatches,
  });
  const ghStatus = github.status;
  const gdStatus = googleDrive.status;

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
      <TranspositionAlert
        mismatches={transpositionMismatches}
        onDismiss={() => setTranspositionMismatches([])}
      />
      <h1 className="mb-4 text-2xl font-bold">{t("sync.title")}</h1>

      <p className="mb-6 text-sm text-text-muted">
        {t("sync.songCount", { count: songCount })},{" "}
        {t("sync.setlistCount", { count: setlistCount })}
      </p>

      <p className="mb-4 text-sm text-text-muted">{t("sync.description")}</p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleExport} disabled={busy} className="btn btn-primary">
          {status.type === "exporting" ? t("sync.exporting") : t("sync.exportToFile")}
        </button>

        <button
          type="button"
          onClick={() => setConfirmImport(true)}
          disabled={busy}
          className="btn btn-ghost"
        >
          {status.type === "importing" ? t("sync.importing") : t("sync.importFile")}
        </button>

        <SetlistHelperImport
          disabled={busy}
          onSuccess={(message) => setStatus({ type: "success", message })}
          onError={(message) => setStatus({ type: "error", message })}
        />
        <SetlistHelperSetlistImport
          disabled={busy}
          onSuccess={(message) => setStatus({ type: "success", message })}
          onError={(message) => setStatus({ type: "error", message })}
        />
      </div>

      <div aria-live="polite">
        {status.type === "success" && <p className="mt-4 text-sm text-accent">{status.message}</p>}
        {status.type === "error" && <p className="mt-4 text-sm text-danger">{status.message}</p>}
      </div>

      <p className="mt-6 text-xs text-text-faint">{t("sync.importNote")}</p>

      <hr className="my-6 border-border" />

      {/* GitHub sync section */}
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
              key={`${ghStatus.ctx.versionToken}:${ghStatus.ctx.local.exportedAt}`}
              diff={ghStatus.ctx.diff}
              onConfirm={github.confirm}
              onCancel={github.reset}
              busy={false}
              notice={ghStatus.refreshed ? t("syncConflicts.reviewRefreshed") : undefined}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={github.start}
                  disabled={github.busy}
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
                    {t("sync.github.lastSync", {
                      time: formatTimeAgo(syncConfig.lastSyncedAt),
                    })}
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

                {ghStatus.type === "success" && <FileSyncSummary files={ghStatus.files} />}

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

      {/* Google Drive sync section */}
      {isGoogleDriveAvailable() && (
        <>
          <hr className="my-6 border-border" />

          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <GoogleDriveIcon className="h-5 w-5" />
            Google Drive
          </h2>

          {!gdConfigured ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-text-muted">{t("sync.googleDrive.notConfigured")}</p>
              <Link
                to={Router.Settings()}
                onClick={() => sessionStorage.setItem(SETTINGS_SCROLL_KEY, "google-drive")}
                className="link-accent text-sm"
              >
                {t("sync.googleDrive.goToSettings")}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {gdStatus.type === "review" ? (
                <SyncReview
                  key={`${gdStatus.ctx.versionToken}:${gdStatus.ctx.local.exportedAt}`}
                  diff={gdStatus.ctx.diff}
                  onConfirm={googleDrive.confirm}
                  onCancel={googleDrive.reset}
                  busy={false}
                  notice={gdStatus.refreshed ? t("syncConflicts.reviewRefreshed") : undefined}
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={googleDrive.start}
                      disabled={googleDrive.busy}
                      className="btn btn-primary"
                    >
                      {gdStatus.type === "authenticating"
                        ? t("sync.googleDrive.authenticating")
                        : gdStatus.type === "pulling"
                          ? "Pulling..."
                          : gdStatus.type === "pushing"
                            ? "Pushing..."
                            : t("sync.googleDrive.sync")}
                    </button>

                    {syncConfig.lastSyncedAt && gdStatus.type === "idle" && (
                      <span className="text-sm text-text-muted">
                        {t("sync.googleDrive.lastSync", {
                          time: formatTimeAgo(syncConfig.lastSyncedAt),
                        })}
                      </span>
                    )}
                  </div>

                  <div aria-live="polite">
                    {gdStatus.type === "success" && (
                      <p className="text-sm text-accent">
                        {gdStatus.result.status === "created"
                          ? t("sync.googleDrive.syncCreated", {
                              songs: gdStatus.result.songCount,
                              setlists: gdStatus.result.setlistCount,
                            })
                          : gdStatus.result.status === "up-to-date"
                            ? t("sync.googleDrive.upToDate")
                            : t("sync.googleDrive.syncSuccess", {
                                songs: gdStatus.result.songCount,
                                setlists: gdStatus.result.setlistCount,
                              })}
                      </p>
                    )}

                    {gdStatus.type === "error" && (
                      <p className="text-sm text-danger">
                        {t("sync.googleDrive.syncFailed", { error: gdStatus.message })}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {confirmImport && (
        <ConfirmModal
          title={t("sync.importConfirmTitle")}
          message={t("sync.importConfirmMessage")}
          confirmLabel={t("sync.yesImport")}
          variant="danger"
          onConfirm={handleImport}
          onCancel={() => setConfirmImport(false)}
        />
      )}
    </div>
  );
}
