import { useDb } from "@db/provider";
import { DEVICE_PLATFORM } from "@domain/device";
import {
  type CompanionDevice,
  type CompanionDevices,
  MIDI_LAST_SEND,
  PRESENCE_TRANSPORT,
} from "@domain/midi/companion";
import { FOLLOW_MODE } from "@domain/midi/settings";
import { useLiveQuery } from "dexie-react-hooks";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Card, CardRow } from "../../design-system/components/card";
import { partLabel } from "../../performance/components/my-part-menu";

/** Route names, as the devices report them, to the name of that part of the app. */
const PAGE_LABEL: Record<string, string> = {
  Catalog: "nav.songs",
  SongNew: "nav.songs",
  SongEdit: "nav.songs",
  Setlists: "nav.setlists",
  SetlistEdit: "nav.setlists",
  TechSheet: "nav.setlists",
  Sync: "nav.sync",
  Settings: "nav.settings",
  SettingsSection: "nav.settings",
  Companion: "nav.companion",
  Chords: "nav.chords",
  Tuner: "nav.tuner",
  Quality: "nav.quality",
  Perform: "companion.devices.onStage",
  PerformSong: "companion.devices.onStage",
  Crew: "companion.devices.inBooth",
};

/** Setlist names and song titles of the ids the devices report, from this device's data. */
function useStageNames(devices: CompanionDevice[]) {
  const db = useDb();
  const setlistIds = devices.flatMap((d) => (d.setlistId ? [d.setlistId] : []));
  const songIds = devices.flatMap((d) => (d.songId ? [d.songId] : []));
  // The query runs again only when the ids change, not at each report
  const key = [...setlistIds, "|", ...songIds].join(",");
  const names = useLiveQuery(async () => {
    const [setlists, songs] = await Promise.all([
      db.setlists.bulkGet(setlistIds),
      db.songs.bulkGet(songIds),
    ]);
    return {
      setlists: new Map(setlists.flatMap((s) => (s ? [[s.id, s.name]] : []))),
      songs: new Map(songs.flatMap((s) => (s ? [[s.id, s.title]] : []))),
    };
  }, [db, key]);
  return names ?? { setlists: new Map<string, string>(), songs: new Map<string, string>() };
}

function shows(
  device: CompanionDevice,
  names: ReturnType<typeof useStageNames>,
  t: TFunction,
): string {
  const page = PAGE_LABEL[device.page] ? t(PAGE_LABEL[device.page]) : device.page;
  const song = device.songId && (names.songs.get(device.songId) ?? device.songId);
  const numbered = song && device.index !== undefined ? `${device.index + 1}. ${song}` : song;
  const setlist = device.setlistId && (names.setlists.get(device.setlistId) ?? device.setlistId);
  return [page, setlist, numbered].filter(Boolean).join(" · ");
}

function MidiBadge({ midi }: { midi: CompanionDevice["midi"] }) {
  const { t } = useTranslation();
  if (midi.transport === PRESENCE_TRANSPORT.off) {
    return <Badge tone="muted">{t("companion.devices.midiOff")}</Badge>;
  }
  const tone =
    midi.lastSend === MIDI_LAST_SEND.ok
      ? "success"
      : midi.lastSend === MIDI_LAST_SEND.failed
        ? "danger"
        : "muted";
  const transport = t(`companion.devices.transport.${midi.transport}`, {
    defaultValue: midi.transport,
  });
  const channel = midi.channel ? ` · ${t("companion.log.channel", { channel: midi.channel })}` : "";
  return (
    <Badge tone={tone}>
      {transport}
      {channel} ·{" "}
      {t(`companion.devices.lastSend.${midi.lastSend}`, { defaultValue: midi.lastSend })}
    </Badge>
  );
}

interface DevicesCardProps {
  devices: CompanionDevices | null | undefined;
  /** This device's id, to point it out. */
  me: string;
}

/** Every device the companion heard from in the last 15 s: who, what it shows, its MIDI. */
export function DevicesCard({ devices, me }: DevicesCardProps) {
  const { t } = useTranslation();
  const list = useMemo(
    () => [...(devices?.devices ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [devices],
  );
  const names = useStageNames(list);

  return (
    <Card
      title={t("companion.devices.heading")}
      aside={devices ? <Badge tone="muted">{list.length}</Badge> : undefined}
    >
      {devices === undefined ? (
        <p className="px-4 py-3 text-sm text-text-muted">{t("common.loading")}</p>
      ) : list.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-muted">{t("companion.devices.none")}</p>
      ) : (
        list.map((device) => {
          const seen = Math.max(0, Math.round(((devices?.now ?? 0) - device.lastSeen) / 1000));
          const platform = device.platform === DEVICE_PLATFORM.other ? "" : device.platform || "";
          // Without "My name", the name already reads "Keys · iPad"
          const details = [device.part ? partLabel(device.part, t, false) : "", platform]
            .filter((detail) => detail && !device.name.includes(detail))
            .concat(shows(device, names, t));
          return (
            <CardRow
              key={device.id}
              label={
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{device.name}</span>
                  {device.id === me && <Badge tone="accent">{t("companion.devices.me")}</Badge>}
                </span>
              }
              description={details.join(" · ")}
            >
              {device.follow === FOLLOW_MODE.lead || device.follow === FOLLOW_MODE.follow ? (
                <Badge tone="accent">{t(`midi.follow.chip.${device.follow}`)}</Badge>
              ) : null}
              <MidiBadge midi={device.midi} />
              <span className="text-xs text-text-faint">
                {seen < 2
                  ? t("companion.devices.seenNow")
                  : t("companion.devices.seen", { count: seen })}
              </span>
            </CardRow>
          );
        })
      )}
    </Card>
  );
}
