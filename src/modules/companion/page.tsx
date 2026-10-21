import { COMPANION_LINK } from "@domain/midi/companion-link";
import { SETTINGS_SECTION } from "@domain/settings-sections";
import { Link } from "@swan-io/chicane";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { PageHeader } from "../design-system/components/page-header";
import { useCompanionLink } from "../shared/hooks/use-companion-link";
import { ConnectionCard } from "./components/connection-card";

/** The companion program on the stage computer: pairing, and what goes through it. */
export function CompanionPage() {
  const { t } = useTranslation();
  const link = useCompanionLink();

  return (
    <div className="p-page">
      <PageHeader title={t("companion.title")} subtitle={t("companion.subtitle")} />
      <div className="max-w-2xl">
        {link.state === COMPANION_LINK.off ? (
          <p className="text-sm text-text-muted">
            {t("companion.notPaired")}{" "}
            <Link
              to={Router.SettingsSection({ section: SETTINGS_SECTION.midi })}
              className="link-accent"
            >
              {t("midi.heading")}
            </Link>
          </p>
        ) : (
          <ConnectionCard link={link} />
        )}
      </div>
    </div>
  );
}
