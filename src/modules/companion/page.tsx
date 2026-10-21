import { COMPANION_LINK } from "@domain/midi/companion-link";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../design-system/components/page-header";
import { useCompanionLink } from "../shared/hooks/use-companion-link";
import { ConnectionCard } from "./components/connection-card";
import { Pairing } from "./components/pairing";

/** The companion program on the stage computer: pairing, and what goes through it. */
export function CompanionPage() {
  const { t } = useTranslation();
  const link = useCompanionLink();

  return (
    <div className="p-page">
      <PageHeader title={t("companion.title")} subtitle={t("companion.subtitle")} />
      <div className="max-w-2xl">
        {link.state === COMPANION_LINK.off ? <Pairing /> : <ConnectionCard link={link} />}
      </div>
    </div>
  );
}
