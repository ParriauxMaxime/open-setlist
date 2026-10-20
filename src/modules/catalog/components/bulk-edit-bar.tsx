import {
  parseSongStatus,
  SONG_STATUS_LIST,
  type SongStatus,
  songStatusLabelKey,
} from "@domain/song-status";
import { useState } from "react";
import { useTranslation } from "react-i18next";

// Option values: a tag is prefixed so that no tag name can read as "new"
const TAG_OPTION_PREFIX = "tag:";
const NEW_TAG_OPTION = "new";

const PILL_SELECT = "field-sm max-w-48 cursor-pointer truncate rounded-full !px-3 !py-1.5 !text-sm";

interface BulkEditBarProps {
  count: number;
  /** Tags already used in the catalog. */
  tags: string[];
  onSetStatus: (status: SongStatus) => void;
  onAddTag: (tag: string) => void;
  onCancel: () => void;
}

/** "3 selected · Set status ▾ · Add tag ▾ · Cancel", above the catalog while selecting. */
export function BulkEditBar({ count, tags, onSetStatus, onAddTag, onCancel }: BulkEditBarProps) {
  const { t } = useTranslation();
  const [newTag, setNewTag] = useState<string | null>(null);
  const empty = count === 0;

  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent-muted px-3 py-2 text-sm">
      <output className="mr-1 font-medium text-text">
        {t("catalog.selectedCount", { count })}
      </output>
      <select
        value=""
        disabled={empty}
        onChange={(e) => {
          const status = parseSongStatus(e.target.value);
          if (status) onSetStatus(status);
        }}
        aria-label={t("catalog.setStatus")}
        className={PILL_SELECT}
      >
        <option value="">{t("catalog.setStatus")}</option>
        {SONG_STATUS_LIST.map((status) => (
          <option key={status} value={status}>
            {t(songStatusLabelKey(status))}
          </option>
        ))}
      </select>
      {newTag === null ? (
        <select
          value=""
          disabled={empty}
          onChange={(e) => {
            const value = e.target.value;
            if (value === NEW_TAG_OPTION) setNewTag("");
            else if (value.startsWith(TAG_OPTION_PREFIX)) {
              onAddTag(value.slice(TAG_OPTION_PREFIX.length));
            }
          }}
          aria-label={t("catalog.addTag")}
          className={PILL_SELECT}
        >
          <option value="">{t("catalog.addTag")}</option>
          {tags.map((tag) => (
            <option key={tag} value={`${TAG_OPTION_PREFIX}${tag}`}>
              {tag}
            </option>
          ))}
          <option value={NEW_TAG_OPTION}>{t("catalog.newTag")}</option>
        </select>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const tag = newTag.trim().toLowerCase();
            if (tag) onAddTag(tag);
            setNewTag(null);
          }}
          className="flex items-center gap-1"
        >
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNewTag(null);
            }}
            placeholder={t("catalog.newTagPlaceholder")}
            aria-label={t("catalog.newTagPlaceholder")}
            className="field-sm w-36"
            // biome-ignore lint/a11y/noAutofocus: opened by picking "New tag…", typing comes next
            autoFocus
          />
          <button type="submit" disabled={empty} className="btn btn-primary btn-sm">
            {t("common.add")}
          </button>
        </form>
      )}
      <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm ml-auto">
        {t("common.cancel")}
      </button>
    </div>
  );
}
