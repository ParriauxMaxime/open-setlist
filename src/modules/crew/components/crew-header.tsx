import type { Setlist } from "@db";
import { formatLongDuration } from "@domain/format";
import { formatGigDate, isoDay } from "@domain/setlist-order";
import { Link, pushUnsafe } from "@swan-io/chicane";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { ToolbarMenu } from "../../design-system/components/toolbar-menu";
import { CHIP, FOLLOW_CHIP_TONE } from "../../performance/components/stage-midi";
import type { FollowLeader } from "../../performance/hooks/use-follow-leader";

interface CrewHeaderProps {
  setlist: Setlist;
  totalSeconds: number;
  currentIndex: number;
  follow: FollowLeader;
}

export function CrewHeader({ setlist, totalSeconds, currentIndex, follow }: CrewHeaderProps) {
  const { t, i18n } = useTranslation();
  const setlistId = setlist.id;
  const when = [
    setlist.date && formatGigDate(setlist.date, i18n.language, isoDay(new Date())),
    setlist.venue,
  ]
    .filter(Boolean)
    .join(" · ");
  const followLabel = t(follow.connected ? "crew.followConnected" : "crew.followOffline");

  return (
    <header className="flex items-center gap-2 border-b border-border px-3 py-3">
      <Link
        to={Router.SetlistEdit({ setlistId })}
        aria-label={t("crew.back")}
        className="perform-btn shrink-0"
      >
        ←
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold leading-tight">{setlist.name}</h1>
        <p className="truncate text-sm text-text-muted">
          {[when, totalSeconds > 0 && formatLongDuration(totalSeconds)].filter(Boolean).join(" · ")}
        </p>
        {follow.available && (
          <span
            className={`${CHIP} mt-1 inline-block ${FOLLOW_CHIP_TONE[follow.connected ? "connected" : "offline"]}`}
          >
            {followLabel}
          </span>
        )}
      </div>
      <ToolbarMenu
        label={t("a11y.moreOptions")}
        triggerClassName="perform-btn"
        items={[
          {
            label: t("crew.openCharts"),
            onClick: () => pushUnsafe(`${Router.Perform({ setlistId })}?start=${currentIndex}`),
          },
          {
            label: t("perform.editSetlist"),
            onClick: () => Router.push("SetlistEdit", { setlistId }),
          },
        ]}
      />
    </header>
  );
}
