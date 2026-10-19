import { FOLLOW_MODE, FOLLOW_MODE_VALUES } from "@domain/midi/settings";
import { useTranslation } from "react-i18next";
import type { FollowLeader } from "../hooks/use-follow-leader";
import { STAGE_MIDI_STATE, type StageMidi } from "../hooks/use-stage-midi";
import { choiceClass } from "./my-part-menu";

const CHIP = "shrink-0 rounded-md border px-2 py-1 text-sm font-medium tabular-nums";

const MIDI_CHIP_TONE: Record<string, string> = {
  [STAGE_MIDI_STATE.sent]: "border-accent text-accent",
  [STAGE_MIDI_STATE.confirmed]: "border-success text-success",
  [STAGE_MIDI_STATE.sending]: "border-border text-text-muted",
  [STAGE_MIDI_STATE.noPatch]: "border-border text-text-faint",
  [STAGE_MIDI_STATE.badCode]: "border-danger text-danger",
  [STAGE_MIDI_STATE.failed]: "border-danger text-danger",
  [STAGE_MIDI_STATE.disconnected]: "border-warning text-warning",
};

/** The sound code sent for this song, and whether it went out. Tap: send again. */
export function MidiChip({ midi }: { midi: StageMidi }) {
  const { t } = useTranslation();
  if (!midi.active) return null;
  const label = t(`midi.stage.${midi.state}`, { code: midi.code ?? "" });

  return (
    <button
      type="button"
      onClick={midi.retry}
      aria-label={label}
      title={label}
      className={`${CHIP} ${MIDI_CHIP_TONE[midi.state]}`}
    >
      MIDI {midi.code ?? "–"}
    </button>
  );
}

/** "Follow the leader" controls for the perform header ⋮ menu. */
export function FollowMenu({ follow }: { follow: FollowLeader }) {
  const { t } = useTranslation();

  return (
    <div className="w-72 border-b border-border px-4 pt-2 pb-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
        {t("midi.follow.title")}
      </div>
      <div className="flex flex-wrap gap-2">
        {FOLLOW_MODE_VALUES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={follow.mode === mode}
            onClick={() => follow.setMode(mode)}
            className={choiceClass(follow.mode === mode)}
          >
            {t(`midi.follow.mode.${mode}`)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-muted">{t(`midi.follow.hint.${follow.mode}`)}</p>
    </div>
  );
}

/** Header reminder that this device leads or follows, greyed while the companion is away. */
export function FollowChip({ follow, onClick }: { follow: FollowLeader; onClick: () => void }) {
  const { t } = useTranslation();
  if (follow.mode === FOLLOW_MODE.off) return null;
  const name = t(`midi.follow.chip.${follow.mode}`);
  const label = follow.connected ? name : `${name} · ${t("midi.follow.offline")}`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${CHIP} ${follow.connected ? "border-accent text-accent" : "border-border text-text-faint"}`}
    >
      {name}
    </button>
  );
}
