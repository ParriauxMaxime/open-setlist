import { useDb } from "@db/provider";
import { exportSnapshot, importSnapshot } from "@db/snapshot";
import { isGoogleDriveAvailable, requestAccessToken } from "@domain/google-auth";
import { useActiveProfileId } from "@domain/profiles";
import { fileAdapter } from "@domain/sync/adapters/file";
import { createGitHubAdapter } from "@domain/sync/adapters/github";
import { createGoogleDriveAdapter } from "@domain/sync/adapters/google-drive";
import { loadSyncConfig } from "@domain/sync/config";
import type { TranspositionMismatch } from "@domain/sync/transposition-mismatch";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardRow } from "../design-system/components/card";
import { ConfirmModal } from "../design-system/components/confirm-modal";
import { GitHubIcon, GoogleDriveIcon } from "../design-system/components/icons";
import { GitHubConfigForm } from "../settings/components/github-config-form";
import { GoogleDriveConfigForm } from "../settings/components/google-drive-config-form";
import { ProviderCard } from "./components/provider-card";
import { SetlistHelperImport } from "./components/setlist-helper-import";
import { SetlistHelperSetlistImport } from "./components/setlist-helper-setlist-import";
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

  // Bumped when a connection is saved or removed below, to read the config again
  const [, setConnectionVersion] = useState(0);
  const refreshConnection = useCallback(() => setConnectionVersion((v) => v + 1), []);
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
      <h1 className="text-2xl font-bold">{t("sync.title")}</h1>
      <p className="mb-6 text-sm text-text-muted">
        {t("sync.songCount", { count: songCount })},{" "}
        {t("sync.setlistCount", { count: setlistCount })}
      </p>

      <div className="max-w-2xl">
        <ProviderCard
          icon={<GitHubIcon className="h-4 w-4" />}
          name="GitHub"
          i18nKey="sync.github"
          connectedLabel={
            ghConfigured
              ? t("settings.github.connected", {
                  repo: `${syncConfig.owner}/${syncConfig.repo}`,
                })
              : undefined
          }
          lastSyncedAt={ghConfigured ? syncConfig.lastSyncedAt : undefined}
          sync={github}
        >
          <GitHubConfigForm
            profileId={profileId}
            defaultOpen={!ghConfigured}
            onChange={refreshConnection}
          />
        </ProviderCard>

        {isGoogleDriveAvailable() && (
          <ProviderCard
            icon={<GoogleDriveIcon className="h-4 w-4" />}
            name="Google Drive"
            i18nKey="sync.googleDrive"
            connectedLabel={gdConfigured ? t("settings.googleDrive.connected") : undefined}
            lastSyncedAt={gdConfigured ? syncConfig.lastSyncedAt : undefined}
            sync={googleDrive}
          >
            <GoogleDriveConfigForm
              profileId={profileId}
              defaultOpen={!gdConfigured}
              onChange={refreshConnection}
            />
          </ProviderCard>
        )}

        <Card title={t("sync.backupHeading")}>
          <CardRow label={t("sync.exportToFile")} description={t("sync.description")}>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy}
              className="btn btn-outline btn-sm"
            >
              {status.type === "exporting" ? t("sync.exporting") : t("common.export")}
            </button>
          </CardRow>
          <CardRow label={t("sync.importFile")} description={t("sync.importNote")}>
            <button
              type="button"
              onClick={() => setConfirmImport(true)}
              disabled={busy}
              className="btn btn-ghost btn-sm"
            >
              {status.type === "importing" ? t("sync.importing") : t("common.import")}
            </button>
          </CardRow>
          <CardRow label={t("sync.setlistHelper")} description={t("sync.setlistHelperDesc")}>
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
          </CardRow>
          {(status.type === "success" || status.type === "error") && (
            <div aria-live="polite" className="px-4 py-3">
              {status.type === "success" && <p className="text-sm text-accent">{status.message}</p>}
              {status.type === "error" && <p className="text-sm text-danger">{status.message}</p>}
            </div>
          )}
        </Card>
      </div>

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
