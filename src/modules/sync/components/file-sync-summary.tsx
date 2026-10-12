import type { FileSyncResult } from "@domain/sync/files";
import { useTranslation } from "react-i18next";

/** What happened to the sheet music after a sync; nothing when the remote carries no files. */
export function FileSyncSummary({ files }: { files: FileSyncResult | "failed" | undefined }) {
  const { t } = useTranslation();
  if (!files) return null;
  if (files === "failed") return <p className="text-sm text-warning">{t("sync.files.failed")}</p>;

  return (
    <>
      {files.uploaded + files.downloaded > 0 && (
        <p className="text-sm text-accent">
          {t("sync.files.synced", { sent: files.uploaded, received: files.downloaded })}
        </p>
      )}
      {files.tooLarge > 0 && (
        <p className="text-sm text-warning">
          {t("sync.files.tooLarge", { count: files.tooLarge })}
        </p>
      )}
      {files.unavailable > 0 && (
        <p className="text-sm text-text-muted">
          {t("sync.files.unavailable", { count: files.unavailable })}
        </p>
      )}
    </>
  );
}
