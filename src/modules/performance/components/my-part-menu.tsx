import { isPartViewActive, viewPitch } from "@domain/chordpro/visibility";
import { formatPitch } from "@domain/chords/notation";
import { ALL_PARTS, INSTRUMENT_PITCH, isKnownPart, PART_EMOJI, partPitch } from "@domain/parts";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useNotation } from "../../shared/hooks/use-notation";
import type { MyPart } from "../hooks/use-my-part";

/** "🎸 Guitar"; `emoji: false` for plain text (file names). Unknown parts are capitalized. */
export function partLabel(part: string, t: TFunction, emoji = true): string {
  if (part === ALL_PARTS) return t("myPart.all");
  if (isKnownPart(part)) {
    const name = t(`myPart.parts.${part}`);
    return emoji ? `${PART_EMOJI[part]} ${name}`.trim() : name;
  }
  return part.charAt(0).toUpperCase() + part.slice(1);
}

function choiceClass(selected: boolean): string {
  return `min-h-11 rounded-md border px-3 text-base transition-colors ${
    selected
      ? "border-accent bg-accent-muted text-accent"
      : "border-border text-text-muted hover:border-text-faint hover:text-text"
  }`;
}

/** "My part" controls for the perform header ⋮ menu. */
export function MyPartMenu({ myPart }: { myPart: MyPart }) {
  const { t } = useTranslation();
  const notation = useNotation();
  const { view, choices, update } = myPart;
  const pitch = partPitch(view.instrument);

  return (
    <div className="w-72 border-b border-border px-4 pt-2 pb-1">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
        {t("myPart.title")}
      </div>
      <div className="flex flex-wrap gap-2">
        {[ALL_PARTS, ...choices].map((part) => {
          const selected = view.instrument === part;
          return (
            <button
              key={part}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ instrument: part })}
              className={choiceClass(selected)}
            >
              {partLabel(part, t)}
            </button>
          );
        })}
      </div>
      {pitch !== INSTRUMENT_PITCH.concert && (
        <fieldset className="mt-2 flex flex-wrap gap-2">
          <legend className="sr-only">{t("myPart.pitch")}</legend>
          <button
            type="button"
            aria-pressed={view.writtenPitch}
            onClick={() => update({ writtenPitch: true })}
            className={choiceClass(view.writtenPitch)}
          >
            {t("myPart.writtenPitch", { pitch: formatPitch(pitch, notation) })}
          </button>
          <button
            type="button"
            aria-pressed={!view.writtenPitch}
            onClick={() => update({ writtenPitch: false })}
            className={choiceClass(!view.writtenPitch)}
          >
            {t("myPart.concertPitch")}
          </button>
        </fieldset>
      )}
      <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-base text-text">
        <input
          type="checkbox"
          checked={view.showChords}
          onChange={(e) => update({ showChords: e.target.checked })}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        {t("myPart.showChords")}
      </label>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-text">
        <input
          type="checkbox"
          checked={view.showCues}
          onChange={(e) => update({ showCues: e.target.checked })}
          className="h-5 w-5 accent-[var(--color-accent)]"
        />
        {t("myPart.showCues")}
      </label>
    </div>
  );
}

/** Header hint shown while a "My part" filter hides something. */
export function MyPartChip({ myPart, onClick }: { myPart: MyPart; onClick: () => void }) {
  const { t } = useTranslation();
  const notation = useNotation();
  const { view } = myPart;
  if (!isPartViewActive(view)) return null;

  const pitch = viewPitch(view);
  const summary = [
    view.instrument !== ALL_PARTS && partLabel(view.instrument, t),
    pitch !== INSTRUMENT_PITCH.concert && formatPitch(pitch, notation),
    !view.showChords && t("myPart.lyricsOnly"),
    !view.showCues && t("myPart.noCues"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 min-w-0 shrink items-center"
      title={t("myPart.chipTitle", { summary })}
      aria-label={t("myPart.chipTitle", { summary })}
    >
      <span className="max-w-40 truncate rounded-full border border-accent bg-accent-muted px-2.5 py-1 text-sm font-medium text-accent">
        {summary}
      </span>
    </button>
  );
}
