import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../../design-system/components/confirm-modal";

const DONE_MS = 6000;

interface PendingRewrite {
  count: number;
  /** Writes the songs, resolves to how many it changed. */
  run: () => Promise<number>;
}

/** Asks "Rewrite 12 songs?" before a mass rewrite, then says how many songs it changed. */
export function useConfirmedRewrite() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingRewrite | null>(null);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    if (doneCount === null) return;
    const timer = setTimeout(() => setDoneCount(null), DONE_MS);
    return () => clearTimeout(timer);
  }, [doneCount]);

  const confirm = async () => {
    if (!pending) return;
    setPending(null);
    setDoneCount(await pending.run());
  };

  const modal = pending && (
    <ConfirmModal
      title={t("quality.rewrite.title", { count: pending.count })}
      message={t("quality.rewrite.message")}
      confirmLabel={t("quality.rewrite.confirm")}
      cancelLabel={t("common.cancel")}
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    />
  );

  const doneLine = doneCount !== null && (
    <output className="flex px-4 py-2 text-sm text-text-muted">
      {t("quality.rewrite.done", { count: doneCount })}
    </output>
  );

  return {
    ask: (count: number, run: PendingRewrite["run"]) => setPending({ count, run }),
    modal,
    doneLine,
  };
}
