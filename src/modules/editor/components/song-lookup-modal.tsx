import type { SongFormValues } from "@domain/schemas/song";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../../design-system/components/form";
import { type SongSearchResult, searchSongs } from "../../lookup";
import { useFocusTrap } from "../../shared/hooks/use-focus-trap";

interface SongLookupModalProps {
  onSelect: (values: Partial<SongFormValues>) => void;
  onClose: () => void;
}

export function SongLookupModal({ onSelect, onClose }: SongLookupModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const trapRef = useFocusTrap(true);

  // Autofocus search input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      try {
        const data = await searchSongs(query, controller.signal);
        if (!controller.signal.aborted) {
          setResults(data);
        }
      } catch {
        // Aborted or network error
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [query]);

  const handleImport = useCallback(
    (result: SongSearchResult) => {
      const values: Partial<SongFormValues> = {
        title: result.title,
        artist: result.artist,
        tags: result.tags.slice(0, 5),
      };

      if (result.durationMs) {
        values.duration = Math.round(result.durationMs / 1000);
      }

      onSelect(values);
    },
    [onSelect],
  );

  const formatDuration = (ms: number | null): string => {
    if (!ms) return "";
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={trapRef as React.RefObject<HTMLDivElement>}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lookup-title"
      className="fixed inset-0 z-50 flex flex-col bg-bg"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-page">
        <h2 id="lookup-title" className="text-lg font-bold">
          {t("lookup.title")}
        </h2>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
          {t("common.close")}
        </button>
      </div>

      {/* Search */}
      <div className="p-page pb-0">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("lookup.searchPlaceholder")}
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-page">
        {searching && results.length === 0 && (
          <p className="text-sm text-text-muted">{t("lookup.searching")}</p>
        )}

        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-text-muted">{t("lookup.noResults")}</p>
        )}

        <div className="flex flex-col gap-1">
          {results.map((result, i) => (
            <button
              type="button"
              key={`${result.title}-${result.artist}-${i}`}
              onClick={() => handleImport(result)}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left hover:bg-bg-raised"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{result.title}</p>
                <p className="truncate text-sm text-text-muted">
                  {result.artist}
                  {result.durationMs ? ` \u00b7 ${formatDuration(result.durationMs)}` : ""}
                </p>
              </div>
              <span className="text-sm text-text-faint shrink-0">{t("lookup.import")}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
