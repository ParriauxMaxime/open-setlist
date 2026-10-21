import { COMPANION_LINK, type CompanionLink } from "@domain/midi/companion-link";
import { displayCompanionAddress, saveMidiSettings } from "@domain/midi/settings";
import { useTranslation } from "react-i18next";
import { Badge, Card, CardRow } from "../../design-system/components/card";

const TONE = {
  [COMPANION_LINK.off]: "muted",
  [COMPANION_LINK.paused]: "muted",
  [COMPANION_LINK.connecting]: "muted",
  [COMPANION_LINK.connected]: "success",
  [COMPANION_LINK.lost]: "danger",
} as const;

/** The paired companion's address, the link's state, and the buttons that change it. */
export function ConnectionCard({ link }: { link: CompanionLink }) {
  const { t } = useTranslation();
  const paused = link.state === COMPANION_LINK.paused;

  return (
    <Card
      title={t("companion.connection.heading")}
      aside={<Badge tone={TONE[link.state]}>{t(`companion.link.${link.state}`)}</Badge>}
    >
      <CardRow
        label={link.status?.name ?? displayCompanionAddress(link.base)}
        description={t(`companion.connection.hint.${link.state}`)}
      >
        {paused ? (
          <button
            type="button"
            onClick={() => saveMidiSettings({ companionPaused: false })}
            className="btn btn-primary btn-sm"
          >
            {t("companion.connection.connect")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => saveMidiSettings({ companionPaused: true })}
            className="btn btn-outline btn-sm"
          >
            {t("companion.connection.disconnect")}
          </button>
        )}
        <button
          type="button"
          onClick={() => saveMidiSettings({ companion: "", companionPaused: false })}
          className="btn btn-ghost btn-sm"
        >
          {t("companion.connection.forget")}
        </button>
      </CardRow>
    </Card>
  );
}
