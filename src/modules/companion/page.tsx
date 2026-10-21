import { deviceId } from "@domain/device";
import { COMPANION_LINK } from "@domain/midi/companion-link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../design-system/components/page-header";
import { useCompanionLink } from "../shared/hooks/use-companion-link";
import { ConnectionCard } from "./components/connection-card";
import { DevicesCard } from "./components/devices-card";
import { HealthCard } from "./components/health-card";
import { LogCard } from "./components/log-card";
import { Pairing } from "./components/pairing";
import {
  useCompanionDevices,
  useCompanionLog,
  useCompanionStatus,
} from "./hooks/use-companion-feeds";

/** The companion program on the stage computer: pairing, and what goes through it. */
export function CompanionPage() {
  const { t } = useTranslation();
  const link = useCompanionLink();
  const [me] = useState(deviceId);
  const live = link.state === COMPANION_LINK.connected ? link.base : null;
  const status = useCompanionStatus(live);
  const devices = useCompanionDevices(live);
  const log = useCompanionLog(live);

  return (
    <div className="p-page">
      <PageHeader title={t("companion.title")} subtitle={t("companion.subtitle")} />
      <div className="max-w-2xl">
        {link.state === COMPANION_LINK.off ? (
          <Pairing />
        ) : (
          <>
            <ConnectionCard link={link} />
            {live && (
              <>
                <HealthCard base={live} status={status ?? link.status} />
                <DevicesCard devices={devices} me={me} />
                <LogCard log={log} devices={devices} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
