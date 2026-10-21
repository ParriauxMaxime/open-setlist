import { formatTimeAgo } from "@domain/format";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Card, CardRow } from "../../design-system/components/card";
import { SyncErrorMessage } from "../../shared/components/sync-error-message";
import type { useRemoteSync } from "../hooks/use-remote-sync";
import { FileSyncSummary } from "./file-sync-summary";
import { SyncReview } from "./sync-review";

interface ProviderCardProps {
  icon: ReactNode;
  name: string;
  /** i18n prefix of this provider's sync strings: `sync.github`, `sync.googleDrive`. */
  i18nKey: string;
  /** The badge text when this profile syncs through this provider. */
  connectedLabel: string | undefined;
  lastSyncedAt: number | null | undefined;
  sync: ReturnType<typeof useRemoteSync>;
  /** The connection form, an accordion row at the bottom of the card. */
  children: ReactNode;
}

/** One remote storage: its state, the sync button, and the connection form. */
export function ProviderCard({
  icon,
  name,
  i18nKey,
  connectedLabel,
  lastSyncedAt,
  sync,
  children,
}: ProviderCardProps) {
  const { t } = useTranslation();
  const { status } = sync;
  const connected = connectedLabel !== undefined;

  const buttonLabel =
    status.type === "authenticating"
      ? t(`${i18nKey}.authenticating`)
      : status.type === "pulling"
        ? t("sync.pulling")
        : status.type === "pushing"
          ? t("sync.pushing")
          : t(`${i18nKey}.sync`);

  return (
    <Card
      title={
        <>
          {icon}
          {name}
        </>
      }
      aside={
        connected ? (
          <Badge>{connectedLabel}</Badge>
        ) : (
          <Badge tone="muted">{t("sync.notConnected")}</Badge>
        )
      }
    >
      {!connected && <p className="px-4 py-3 text-sm text-text-muted">{t(`${i18nKey}.intro`)}</p>}

      {connected && status.type === "review" && (
        <div className="px-4 py-3">
          <SyncReview
            key={`${status.ctx.versionToken}:${status.ctx.local.exportedAt}`}
            diff={status.ctx.diff}
            onConfirm={sync.confirm}
            onCancel={sync.reset}
            busy={false}
            notice={status.refreshed ? t("syncConflicts.reviewRefreshed") : undefined}
          />
        </div>
      )}

      {connected && status.type !== "review" && (
        <CardRow
          label={t(`${i18nKey}.sync`)}
          description={
            lastSyncedAt && status.type === "idle"
              ? t(`${i18nKey}.lastSync`, { time: formatTimeAgo(lastSyncedAt) })
              : undefined
          }
        >
          <button
            type="button"
            onClick={sync.start}
            disabled={sync.busy}
            className="btn btn-primary btn-sm"
          >
            {buttonLabel}
          </button>
        </CardRow>
      )}

      {(status.type === "success" || status.type === "error") && (
        <div aria-live="polite" className="px-4 py-3">
          {status.type === "success" && (
            <p className="text-sm text-accent">
              {status.result.status === "created"
                ? t(`${i18nKey}.syncCreated`, {
                    songs: status.result.songCount,
                    setlists: status.result.setlistCount,
                  })
                : status.result.status === "up-to-date"
                  ? t("sync.upToDate")
                  : t(`${i18nKey}.syncSuccess`, {
                      songs: status.result.songCount,
                      setlists: status.result.setlistCount,
                    })}
            </p>
          )}
          {status.type === "success" && <FileSyncSummary files={status.files} />}
          {status.type === "error" && (
            <SyncErrorMessage lead={t("syncError.syncFailed")} problem={status.problem} />
          )}
        </div>
      )}

      {children}
    </Card>
  );
}
