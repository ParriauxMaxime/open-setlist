import type { SyncProblem } from "@domain/sync/sync-error";
import { useTranslation } from "react-i18next";
import { Disclosure } from "../../design-system/components/card";

interface SyncErrorMessageProps {
  /** What did not happen: "Sync did not go through.", "Could not connect." */
  lead: string;
  problem: SyncProblem;
}

/** A sync or connection failure in a plain sentence, the service's raw answer folded away. */
export function SyncErrorMessage({ lead, problem }: SyncErrorMessageProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-danger">
        {lead} {t(`syncError.${problem.kind}`)}
      </p>
      {problem.detail && (
        <Disclosure summary={t("syncError.details")}>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-text-muted">
            {problem.detail}
          </pre>
        </Disclosure>
      )}
    </div>
  );
}
