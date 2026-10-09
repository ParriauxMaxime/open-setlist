import { formatChord, NOTATION_LIST, type Notation } from "@domain/chords/notation";
import { createId } from "@domain/id";
import { extractInviteParam } from "@domain/invite";
import { PART_EMOJI, PART_VALUES } from "@domain/parts";
import { loadPreferences, savePreferences } from "@domain/preferences";
import { addProfile, setActiveProfileId } from "@domain/profiles";
import {
  applyWelcomeChoices,
  completeFirstRun,
  useWelcome,
  WELCOME,
  type WelcomeChoices,
} from "@domain/welcome";
import i18n from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { useFocusTrap } from "../hooks/use-focus-trap";

/** Each notation named the way its players sing the scale. */
const NOTATION_SAMPLE: Record<Notation, string> = {
  english: "C D E",
  solfege: "Do Ré Mi",
  german: "C D E H",
};

/** Bm7 shows the difference: Sim7 in solfège, Hm7 in German. */
const EXAMPLE_CHORDS = ["G", "Bm7", "C", "D7"];

const LOCALES = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
] as const;

function chipClass(selected: boolean): string {
  return `inline-flex min-h-9 items-center gap-1 rounded-md border px-2.5 text-sm transition-colors ${
    selected
      ? "border-accent bg-accent-muted text-accent"
      : "border-border text-text-muted hover:border-text-faint hover:text-text"
  }`;
}

interface FirstRunSetupProps {
  /** Called when the setup closes, so the page re-reads the new preferences. */
  onDone: () => void;
}

/** One-screen setup the first time the app opens. Returning users never see it. */
export function FirstRunSetup({ onDone }: FirstRunSetupProps) {
  const welcome = useWelcome();
  // An invite link opens its own dialog, which asks for the instrument
  const [invited] = useState(() => extractInviteParam() !== null);
  if (welcome !== WELCOME.firstRun || invited) return null;
  return <FirstRunDialog onDone={onDone} />;
}

function FirstRunDialog({ onDone }: FirstRunSetupProps) {
  const { t } = useTranslation();
  const trapRef = useFocusTrap(true);
  const [initial] = useState(loadPreferences);
  const [choices, setChoices] = useState<WelcomeChoices>(() => ({
    part: null,
    notation: initial.notation,
    locale: initial.locale,
  }));

  // Saved on each tap, like Settings: skipping keeps what was already picked
  const choose = (patch: Partial<WelcomeChoices>) => {
    const next = { ...choices, ...patch };
    setChoices(next);
    savePreferences(applyWelcomeChoices(initial, next));
    if (patch.locale) i18n.changeLanguage(patch.locale);
  };

  const finish = useCallback(() => {
    completeFirstRun();
    onDone();
  }, [onDone]);

  // The band's songs go to their own profile, away from the demo songs
  const importFromSetlistHelper = () => {
    const id = createId();
    addProfile({ id, name: t("welcome.bandProfile"), createdAt: Date.now() });
    setActiveProfileId(id);
    finish();
    Router.push("Sync");
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [finish]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl bg-bg p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 id="first-run-title" className="text-lg font-bold">
              {t("welcome.title")}
            </h2>
            <p className="text-sm text-text-muted">{t("welcome.intro")}</p>
          </div>
          <button type="button" onClick={finish} className="btn btn-ghost btn-sm shrink-0">
            {t("welcome.skip")}
          </button>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">{t("welcome.instrument")}</legend>
          <p className="mb-2 text-xs text-text-faint">{t("welcome.instrumentHint")}</p>
          <div className="flex flex-wrap gap-1.5">
            {PART_VALUES.map((part) => {
              const selected = choices.part === part;
              return (
                <button
                  key={part}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => choose({ part: selected ? null : part })}
                  className={chipClass(selected)}
                >
                  {PART_EMOJI[part] && <span aria-hidden="true">{PART_EMOJI[part]}</span>}
                  {t(`myPart.parts.${part}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("welcome.notation")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {NOTATION_LIST.map((notation) => (
              <button
                key={notation}
                type="button"
                aria-pressed={choices.notation === notation}
                title={t(`notation.${notation}`)}
                onClick={() => choose({ notation })}
                className={chipClass(choices.notation === notation)}
              >
                {NOTATION_SAMPLE[notation]}
              </button>
            ))}
          </div>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-sm text-text-muted">
            {t("welcome.example")}
            {EXAMPLE_CHORDS.map((chord) => (
              <span key={chord} className="font-semibold text-chord">
                {formatChord(chord, choices.notation)}
              </span>
            ))}
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("welcome.language")}</legend>
          <div className="flex gap-1.5">
            {LOCALES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                lang={value}
                aria-pressed={choices.locale === value}
                onClick={() => choose({ locale: value })}
                className={chipClass(choices.locale === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={importFromSetlistHelper}
            className="btn btn-primary w-full whitespace-normal py-3 text-base"
          >
            {t("welcome.importSetlistHelper")}
          </button>
          <p className="text-center text-xs text-text-faint">{t("welcome.importHint")}</p>
          <button
            type="button"
            onClick={finish}
            className="btn btn-outline w-full whitespace-normal py-3 text-base"
          >
            {t("welcome.exploreDemo")}
          </button>
        </div>
      </div>
    </div>
  );
}
