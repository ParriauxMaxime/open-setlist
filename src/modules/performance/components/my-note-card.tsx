import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

interface MyNoteCardProps {
  text: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onEdit: () => void;
}

const CARD_BTN =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-xl text-note-text active:bg-bg-hover";

// A click on the song strip toggles the header; buttons on the card shouldn't.
function stopping(action: () => void) {
  return (e: MouseEvent) => {
    e.stopPropagation();
    action();
  };
}

/** The musician's private note, pinned at the top of the song (under the setup line). */
export function MyNoteCard({ text, collapsed, onToggleCollapsed, onEdit }: MyNoteCardProps) {
  const { t } = useTranslation();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={stopping(onToggleCollapsed)}
        aria-expanded={false}
        aria-label={t("myNotes.expand")}
        title={t("myNotes.expand")}
        className="flex h-11 w-11 items-center justify-center self-start rounded-md border border-note-border bg-note-bg text-xl"
      >
        📌
      </button>
    );
  }

  return (
    <aside
      aria-label={t("myNotes.title")}
      className="flex items-start gap-1 rounded-md border border-note-border bg-note-bg py-1 pl-3"
    >
      <div className="min-w-0 flex-1 py-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-note-text">
          📌 {t("myNotes.title")}
        </div>
        <p className="whitespace-pre-wrap break-words text-perform-chord text-text">{text}</p>
      </div>
      <button
        type="button"
        onClick={stopping(onEdit)}
        aria-label={t("myNotes.edit")}
        title={t("myNotes.edit")}
        className={CARD_BTN}
      >
        ✎
      </button>
      <button
        type="button"
        onClick={stopping(onToggleCollapsed)}
        aria-expanded={true}
        aria-label={t("myNotes.collapse")}
        title={t("myNotes.collapse")}
        className={CARD_BTN}
      >
        −
      </button>
    </aside>
  );
}
