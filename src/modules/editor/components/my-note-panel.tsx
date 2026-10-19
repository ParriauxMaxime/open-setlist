import { getMyNote, MY_NOTE_MAX_LENGTH, setMyNote } from "@domain/my-notes";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Disclosure } from "../../design-system/components/card";
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
    <Disclosure
      summary={<span className="text-note-text">📌 {t("myNotes.panelTitle")}</span>}
      defaultOpen={openOnLoad}
      tone="note"
      className="mb-3"
    >
      <div className="flex flex-col gap-1.5">
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
    </Disclosure>
  );
}
