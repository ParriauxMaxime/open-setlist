import type { CompanionStatus } from "@domain/midi/companion";
import { displayCompanionAddress } from "@domain/midi/settings";
import { useTranslation } from "react-i18next";
import { Card } from "../../design-system/components/card";

function uptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, "0")}` : `${minutes} min`;
}

/** What the companion program says about itself, refreshed every few seconds. */
export function HealthCard({ base, status }: { base: string; status: CompanionStatus | null }) {
  const { t } = useTranslation();
  if (!status) return null;
  const missing = <span className="text-warning">{t("companion.health.none")}</span>;
  const rows = [
    [
      t("companion.health.program"),
      `${status.name} · ${status.version}${
        status.uptime === undefined
          ? ""
          : ` · ${t("companion.health.uptime", { time: uptime(status.uptime) })}`
      }`,
    ],
    [t("companion.health.midiOut"), status.midiOut ?? missing],
    [t("companion.health.midiIn"), status.midiIn ?? missing],
    [
      t("companion.health.bluetooth"),
      t(`companion.health.bluetoothState.${status.bluetooth ?? "unavailable"}`, {
        defaultValue: status.bluetooth,
      }),
    ],
    [t("companion.health.address"), displayCompanionAddress(base)],
  ] as const;

  return (
    <Card title={t("companion.health.heading")}>
      <dl className="grid grid-cols-[2fr_3fr] gap-x-4 sm:grid-cols-[auto_1fr] gap-y-2 px-4 py-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text">{label}</dt>
            <dd className="min-w-0 break-words text-text-muted">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
