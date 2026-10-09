import { useDb } from "@db/provider";
import {
  pickTrySetlist,
  WHATS_NEW_ITEMS,
  WHATS_NEW_TARGET,
  type WhatsNewTarget,
} from "@domain/welcome";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

/** Page a "Try it" link opens; perform and print need a setlist. */
function targetHref(target: WhatsNewTarget, setlistId: string | undefined): string | undefined {
  switch (target) {
    case WHATS_NEW_TARGET.perform:
      return setlistId ? Router.Perform({ setlistId }) : undefined;
    case WHATS_NEW_TARGET.print:
      return setlistId ? Router.Print({ setlistId }) : undefined;
    case WHATS_NEW_TARGET.import:
      return Router.Sync();
    case WHATS_NEW_TARGET.newSong:
      return Router.SongNew();
    case WHATS_NEW_TARGET.settings:
      return Router.Settings();
  }
}

interface WhatsNewCardProps {
  /** Close button, for the one-time card on the catalog. */
  onDismiss?: () => void;
  className?: string;
}

/** Recent features, one line each, with a link to try them. */
export function WhatsNewCard({ onDismiss, className = "" }: WhatsNewCardProps) {
  const { t } = useTranslation();
  const db = useDb();
  const titleId = useId();
  const setlists = useLiveQuery(() => db.setlists.toArray(), [db]);
  const setlistId = pickTrySetlist(setlists ?? [])?.id;

  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-lg border border-accent/30 bg-accent-muted px-3 py-2 ${className}`}
    >
      <div className="flex items-start gap-2">
        <h2 id={titleId} className="flex-1 text-sm font-semibold text-accent">
          {t("welcome.whatsNew.title")}
        </h2>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 p-0.5 text-text-faint hover:text-text"
            aria-label={t("welcome.whatsNew.close")}
          >
            {"✕"}
          </button>
        )}
      </div>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {WHATS_NEW_ITEMS.map(({ id, target }) => {
          const href = target && targetHref(target, setlistId);
          return (
            <li key={id}>
              <span className="font-medium text-text">
                {t(`welcome.whatsNew.items.${id}.title`)}
              </span>
              <span className="text-text-muted">
                {" — "}
                {t(`welcome.whatsNew.items.${id}.desc`)}
              </span>
              {href && (
                <>
                  {" "}
                  <Link to={href} className="whitespace-nowrap text-accent hover:underline">
                    {t("welcome.whatsNew.tryIt")} →
                  </Link>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
