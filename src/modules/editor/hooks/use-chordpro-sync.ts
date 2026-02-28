/**
 * Bidirectional sync between ChordPro content and form metadata fields.
 *
 * - Content → Fields: debounced parse of ChordPro directives updates form fields
 * - Fields → Content: metadata field changes insert/update directives in content
 * - Loop prevention via `syncSourceRef` ("content" | "fields" | null)
 */

import {
  directiveToDuration,
  directiveToTags,
  durationToDirective,
  removeDirective,
  setDirective,
  tagsToDirective,
} from "@domain/chordpro/directives";
import { parse } from "@domain/chordpro/parser";
import type { SongFormValues } from "@domain/schemas/song";
import { useEffect, useRef } from "react";
import type { UseFormGetValues, UseFormSetValue, UseFormWatch } from "react-hook-form";

interface SyncOptions {
  watch: UseFormWatch<SongFormValues>;
  setValue: UseFormSetValue<SongFormValues>;
  getValues: UseFormGetValues<SongFormValues>;
}

/** Map from metadata key (parser output) to form field name. */
const META_TO_FIELD: Record<string, keyof SongFormValues> = {
  title: "title",
  artist: "artist",
  key: "key",
  bpm: "bpm",
  duration: "duration",
  tags: "tags",
  notes: "notes",
  techNotes: "techNotes",
};

/** Map from form field name to ChordPro directive name. */
const FIELD_TO_DIRECTIVE: Partial<Record<keyof SongFormValues, string>> = {
  title: "title",
  artist: "artist",
  key: "key",
  bpm: "bpm",
  duration: "duration",
  tags: "tags",
  notes: "notes",
  techNotes: "tech_notes",
};

export function useChordProSync({ watch, setValue, getValues }: SyncOptions) {
  const syncSourceRef = useRef<"content" | "fields" | null>(null);
  const settledRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mark as settled after initial form population
  useEffect(() => {
    const timeout = setTimeout(() => {
      settledRef.current = true;
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  // Content → Fields sync (debounced)
  useEffect(() => {
    const sub = watch((values, { name }) => {
      if (name !== "content") return;
      if (!settledRef.current) return;
      if (syncSourceRef.current === "fields") return;

      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const content = values.content;
        if (!content) return;

        syncSourceRef.current = "content";
        try {
          const { metadata } = parse(content);

          for (const [metaKey, fieldName] of Object.entries(META_TO_FIELD)) {
            const raw = metadata[metaKey];
            if (raw === undefined) continue;

            switch (fieldName) {
              case "bpm": {
                const num = Number(raw);
                if (num && num !== getValues("bpm")) {
                  setValue("bpm", num, { shouldDirty: true });
                }
                break;
              }
              case "duration": {
                const secs = directiveToDuration(raw);
                if (secs && secs !== getValues("duration")) {
                  setValue("duration", secs, { shouldDirty: true });
                }
                break;
              }
              case "tags": {
                const tags = directiveToTags(raw);
                const current = getValues("tags");
                if (JSON.stringify(tags) !== JSON.stringify(current)) {
                  setValue("tags", tags, { shouldDirty: true });
                }
                break;
              }
              default: {
                if (raw !== getValues(fieldName)) {
                  setValue(fieldName, raw, { shouldDirty: true });
                }
              }
            }
          }
        } finally {
          // Clear after a tick so the field watcher doesn't re-trigger
          setTimeout(() => {
            syncSourceRef.current = null;
          }, 0);
        }
      }, 300);
    });

    return () => {
      sub.unsubscribe();
      clearTimeout(debounceRef.current);
    };
  }, [watch, setValue, getValues]);

  // Fields → Content sync
  useEffect(() => {
    const sub = watch((values, { name }) => {
      if (!name || name === "content") return;
      if (!settledRef.current) return;
      if (syncSourceRef.current === "content") return;

      const directiveName = FIELD_TO_DIRECTIVE[name as keyof SongFormValues];
      if (!directiveName) return;

      const content = values.content ?? "";
      if (!content) return;

      syncSourceRef.current = "fields";
      try {
        let newContent: string;
        const fieldValue = values[name as keyof SongFormValues];

        switch (name) {
          case "bpm":
          case "duration": {
            const num = fieldValue as number | undefined;
            if (num != null) {
              const val = name === "duration" ? durationToDirective(num) : String(num);
              newContent = setDirective(content, directiveName, val);
            } else {
              newContent = removeDirective(content, directiveName);
            }
            break;
          }
          case "tags": {
            const tags = fieldValue as string[];
            if (tags.length > 0) {
              newContent = setDirective(content, directiveName, tagsToDirective(tags));
            } else {
              newContent = removeDirective(content, directiveName);
            }
            break;
          }
          default: {
            const str = fieldValue as string | undefined;
            if (str) {
              newContent = setDirective(content, directiveName, str);
            } else {
              newContent = removeDirective(content, directiveName);
            }
          }
        }

        if (newContent !== content) {
          setValue("content", newContent, { shouldDirty: true });
        }
      } finally {
        setTimeout(() => {
          syncSourceRef.current = null;
        }, 0);
      }
    });

    return () => sub.unsubscribe();
  }, [watch, setValue]);
}
