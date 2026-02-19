import type { Song } from "@db";
import { Link } from "@swan-io/chicane";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";

interface PerformHeaderProps {
  visible: boolean;
  song: Song | undefined;
  isFirst: boolean;
  isLast: boolean;
  setlistId?: string;
  onPrev: () => void;
  onNext: () => void;
  onOpenSidebar: () => void;
}

export function PerformHeader({
  visible,
  song,
  isFirst,
  isLast,
  setlistId,
  onPrev,
  onNext,
  onOpenSidebar,
}: PerformHeaderProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("click", handler, true);
    return () => window.removeEventListener("click", handler, true);
  }, [menuOpen]);

  return (
    <div className="perform-header" data-visible={visible}>
      <div className="perform-header-inner">
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Sidebar toggle */}
          <button
            type="button"
            onClick={onOpenSidebar}
            className="perform-btn shrink-0"
            aria-label="Open menu"
          >
            ☰
          </button>

          {/* Song info */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold leading-tight">
              {song?.title ?? t("common.unknown")}
            </div>
            {song?.artist && <div className="truncate text-sm text-text-muted">{song.artist}</div>}
          </div>

          {/* Navigation + menu */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={isFirst}
              className="perform-btn"
              aria-label="Previous song"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={isLast}
              className="perform-btn"
              aria-label="Next song"
            >
              ›
            </button>

            {/* 3-dot menu */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="perform-btn"
                aria-label="More options"
              >
                ⋮
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-md border border-border bg-bg-surface py-1 shadow-lg">
                  {setlistId && (
                    <Link
                      to={Router.SetlistEdit({ setlistId })}
                      className="block px-4 py-2.5 text-left text-base text-text hover:bg-bg-hover"
                    >
                      {t("perform.editSetlist")}
                    </Link>
                  )}
                  {song && (
                    <Link
                      to={Router.SongEdit({ songId: song.id })}
                      className="block px-4 py-2.5 text-left text-base text-text hover:bg-bg-hover"
                    >
                      {t("perform.editSong")}
                    </Link>
                  )}
                  <Link
                    to={Router.Settings()}
                    className="block px-4 py-2.5 text-left text-base text-text hover:bg-bg-hover"
                  >
                    {t("perform.displaySettings")}
                  </Link>
                  <button
                    type="button"
                    className="block w-full px-4 py-2.5 text-left text-base text-danger hover:bg-bg-hover"
                  >
                    {t("perform.deleteSong")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
