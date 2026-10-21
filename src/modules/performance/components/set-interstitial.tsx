import type { Setlist } from "@db";
import { isSetBreak, setLabel } from "@domain/perform-tempo";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FlatEntry } from "../hooks/use-setlist-navigation";

const VISIBLE_MS = 1800;

interface NoteBlock {
  kind: "setlist" | "set";
  title: string;
  notes: string;
}

function samePosition(a: FlatEntry | undefined, b: FlatEntry) {
  return a?.setIndex === b.setIndex && a.indexInSet === b.indexInSet;
}

interface Shown {
  id: number;
  label: string;
  /** Notes to read: the card stays until tapped instead of fading. */
  blocks: NoteBlock[];
}

interface SetInterstitialProps {
  current: FlatEntry | undefined;
  setlist: Setlist | null | undefined;
}

/**
 * Shows the set name when navigation crosses into another set. With setlist or set notes
 * to read it stays until tapped; without, it fades and never blocks input.
 */
export function SetInterstitial({ current, setlist }: SetInterstitialProps) {
  const { t } = useTranslation();
  const previous = useRef(current);
  const opened = useRef(false);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = current;
    if (!current || !setlist) return;
    const label = setLabel(current, (setNumber) =>
      t("performTempo.setNumber", { number: setNumber }),
    );
    const setNotes = setlist.sets[current.setIndex]?.notes?.trim();

    if (!opened.current) {
      opened.current = true;
      const atStart = current.setIndex === 0 && current.indexInSet === 0;
      const setlistNotes = setlist.notes?.trim();
      if (!atStart || (!setlistNotes && !setNotes)) return;
      const blocks: NoteBlock[] = [];
      if (setlistNotes) blocks.push({ kind: "setlist", title: setlist.name, notes: setlistNotes });
      if (setNotes) blocks.push({ kind: "set", title: label, notes: setNotes });
      setShown({ id: Date.now(), label: blocks[0].title, blocks });
      return;
    }

    if (!isSetBreak(from, current)) {
      if (!samePosition(from, current)) setShown((s) => (s?.blocks.length ? null : s));
      return;
    }
    setShown({
      id: Date.now(),
      label,
      blocks: setNotes ? [{ kind: "set", title: label, notes: setNotes }] : [],
    });
  }, [current, setlist, t]);

  const holds = !!shown && shown.blocks.length > 0;

  useEffect(() => {
    if (!shown || holds) return;
    const timer = setTimeout(() => setShown(null), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shown, holds]);

  useEffect(() => {
    if (!holds) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShown(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [holds]);

  if (!shown) return null;

  if (!holds) {
    return (
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-1/4 z-20 flex justify-center px-4"
      >
        <span
          key={shown.id}
          className="set-interstitial truncate rounded-lg border border-border bg-bg-surface/90 px-8 py-4 text-3xl font-bold text-accent shadow-lg"
        >
          {shown.label}
        </span>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[15%] z-20 flex justify-center px-4"
    >
      <button
        key={shown.id}
        type="button"
        onClick={() => setShown(null)}
        className="set-interstitial-hold pointer-events-auto flex max-h-[60dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-bg-surface px-6 py-5 text-left shadow-lg"
      >
        {shown.blocks.map((block, i) => (
          <span key={block.kind} className="flex flex-col gap-1">
            <span
              className={`break-words font-bold text-accent ${i === 0 ? "text-3xl" : "text-xl"}`}
            >
              {block.title}
            </span>
            <span className="whitespace-pre-wrap text-lg text-text">{block.notes}</span>
          </span>
        ))}
        <span className="text-sm text-text-muted">{t("perform.tapToClose")}</span>
      </button>
    </div>
  );
}
