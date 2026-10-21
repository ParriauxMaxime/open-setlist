import { formatTimeAgo } from "@domain/format";
import type { SyncConfig } from "@domain/sync/config";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const REFRESH_MS = 60_000;

interface SyncStatusLineProps {
  config: SyncConfig | null;
  /** Local changes waiting for the next sync, undefined before the first one. */
  pending: number | undefined;
  /** The last sync attempt on this page failed. */
  failed: boolean;
}

/** Connected to what, last synced when, what waits to go out, whether it went wrong. */
export function SyncStatusLine({ config, pending, failed }: SyncStatusLineProps) {
  const { t } = useTranslation();
  // "3 min ago" moves on while the page stays open
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (!config) {
    return <p className="text-sm text-text-muted">{t("sync.status.notConnected")}</p>;
  }

  const parts =
    config.adapter === "github" ? ["GitHub", `${config.owner}/${config.repo}`] : ["Google Drive"];
  parts.push(
    config.lastSyncedAt
      ? t("sync.status.lastSynced", { time: formatTimeAgo(config.lastSyncedAt) })
      : t("sync.status.neverSynced"),
  );
  if (pending !== undefined) {
    parts.push(
      pending > 0 ? t("sync.status.pending", { count: pending }) : t("sync.status.nothingPending"),
    );
  }

  return (
    <p className="text-sm text-text-muted">
      {parts.join(" · ")}
      {failed && <span className="text-danger"> · {t("sync.status.failed")}</span>}
    </p>
  );
}
