import type { CompanionDevices, CompanionLog } from "@domain/midi/companion";
import { type DecodedMidi, decodeMidiBatch, MIDI_MESSAGE_KIND } from "@domain/midi/describe";
import { MIDI_TRANSPORT } from "@domain/midi/settings";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Badge, Card } from "../../design-system/components/card";

function describe(message: DecodedMidi, t: TFunction): string {
  switch (message.kind) {
    case MIDI_MESSAGE_KIND.note:
      return t("companion.log.note", message);
    case MIDI_MESSAGE_KIND.controlChange:
      return t("companion.log.cc", message);
    case MIDI_MESSAGE_KIND.programChange:
      return t("companion.log.pc", message);
    case MIDI_MESSAGE_KIND.other:
      return message.bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
  }
}

interface LogCardProps {
  log: CompanionLog | null | undefined;
  devices: CompanionDevices | null | undefined;
}

/** The last 50 batches the companion played, newest first, with the device that sent each. */
export function LogCard({ log, devices }: LogCardProps) {
  const { t } = useTranslation();
  const names = new Map(devices?.devices.map((device) => [device.id, device.name]));
  const entries = log?.entries ?? [];

  return (
    <Card title={t("companion.log.heading")} description={t("companion.log.desc")}>
      {log === undefined ? (
        <p className="px-4 py-3 text-sm text-text-muted">{t("common.loading")}</p>
      ) : entries.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-muted">{t("companion.log.none")}</p>
      ) : (
        <ol>
          {entries.map((entry) => (
            <li
              key={entry.seq}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-border px-4 py-2 text-sm first:border-t-0"
            >
              <time className="shrink-0 whitespace-nowrap text-xs tabular-nums text-text-faint">
                {new Date(entry.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
              <span className="min-w-0 flex-1 truncate text-text">
                {(entry.device && names.get(entry.device)) || entry.from}
              </span>
              <span className="w-full text-text-muted sm:w-auto">
                {decodeMidiBatch(entry.messages)
                  .map((message) => describe(message, t))
                  .join(", ")}
              </span>
              {entry.via === MIDI_TRANSPORT.bluetooth && <Badge tone="muted">Bluetooth</Badge>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
