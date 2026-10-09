import { getMyNote, MY_NOTE_MAX_LENGTH, setMyNote } from "@domain/my-notes";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Textarea } from "../../design-system/components/form";

interface MyNotePanelProps {
  profileId: string;
  songId: string;
}

/**
 * The musician's private note for this song, saved on this device as they type. Rendered
 * outside the song form on purpose: it never dirties the form nor ends up in the synced song.
 */
export function MyNotePanel({ profileId, songId }: MyNotePanelProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => getMyNote(profileId, songId));
  // Open on load only when there is a note to read; then the user decides
  const [openOnLoad] = useState(() => draft !== "");

  return (
    <details open={openOnLoad} className="mb-3 rounded-md border border-note-border bg-note-bg">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-note-text">
        📌 {t("myNotes.panelTitle")}
      </summary>
      <div className="flex flex-col gap-1.5 border-t border-note-border px-3 py-3">
        <Textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setMyNote(profileId, songId, e.target.value);
          }}
          aria-label={t("myNotes.title")}
          placeholder={t("myNotes.placeholder")}
          maxLength={MY_NOTE_MAX_LENGTH}
          rows={2}
          className="resize-y"
        />
        <p className="text-xs text-text-muted">
          {t("myNotes.privateHint")} {t("myNotes.autosaved")}
        </p>
      </div>
    </details>
  );
}
