import { MY_NOTE_MAX_LENGTH } from "@domain/my-notes";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

interface MyNoteEditorProps {
  songTitle: string;
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}

/** Quick inline editor for the private note, opened from the ⋮ menu without leaving the stage. */
export function MyNoteEditor({ songTitle, initialText, onSave, onCancel }: MyNoteEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState(initialText);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
      className="flex shrink-0 flex-col gap-2 border-b border-note-border bg-note-bg px-4 py-3"
    >
      <label htmlFor={id} className="truncate text-sm font-semibold text-note-text">
        📌 {t("myNotes.editorTitle", { title: songTitle })}
      </label>
      <textarea
        id={id}
        // biome-ignore lint/a11y/noAutofocus: opened on purpose from the menu, ready to type
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave(draft);
          }
        }}
        rows={3}
        maxLength={MY_NOTE_MAX_LENGTH}
        placeholder={t("myNotes.placeholder")}
        // 16px text: smaller makes iOS zoom the stage on focus
        className="w-full resize-y select-text rounded-md border border-border bg-bg-surface px-3 py-2 text-base text-text placeholder:text-text-faint focus:border-border-focus"
      />
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-text-muted">
          {t("myNotes.privateHint")}
          {initialText && ` ${t("myNotes.emptyToDelete")}`}
        </p>
        <button type="button" onClick={onCancel} className="btn btn-ghost min-h-11 min-w-24">
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-primary min-h-11 min-w-24">
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
