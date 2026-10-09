import type { Song } from "@db";
import { Link } from "@swan-io/chicane";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import type { MyPart } from "../hooks/use-my-part";
import type { Tempo } from "../hooks/use-tempo";
import { KeyChips } from "./key-chips";
import { MyPartChip, MyPartMenu } from "./my-part-menu";
import { TempoChip } from "./tempo-chip";

interface PerformHeaderProps {
  visible: boolean;
  song: Song | undefined;
  isFirst: boolean;
  isLast: boolean;
  setlistId?: string;
  transposition: number;
  transposeOpen: boolean;
  onTranspose: (delta: number) => void;
  onToggleTranspose: () => void;
  tempo: Tempo;
  autoScrolling: boolean;
  showScrollSpeed: boolean;
  scrollSpeed: number | null;
  /** True when the speed is derived from duration rather than stored on the song. */
  scrollSpeedDerived: boolean;
  onToggleAutoScroll: () => void;
  onScrollSpeed: (delta: number) => void;
  fullscreenSupported: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenSidebar: () => void;
  myPart: MyPart;
  hasMyNote: boolean;
  onEditMyNote: () => void;
}

export function PerformHeader({
  visible,
  song,
  isFirst,
  isLast,
  setlistId,
  transposition,
  transposeOpen,
  onTranspose,
  onToggleTranspose,
  tempo,
  autoScrolling,
  showScrollSpeed,
  scrollSpeed,
  scrollSpeedDerived,
  onToggleAutoScroll,
  onScrollSpeed,
  fullscreenSupported,
  isFullscreen,
  onToggleFullscreen,
  onPrev,
  onNext,
  onOpenSidebar,
  myPart,
  hasMyNote,
  onEditMyNote,
}: PerformHeaderProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const showTranspose = transposeOpen || transposition !== 0;

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("click", handleClick, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("keydown", handleKey);
    };
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
            aria-label={t("a11y.openMenu")}
          >
            ☰
          </button>

          {/* Song info */}
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold leading-tight">
              {song?.title ?? t("common.unknown")}
            </div>
            {song?.artist && <div className="truncate text-sm text-text-muted">{song.artist}</div>}
            <KeyChips song={song} transposition={transposition} partView={myPart.view} />
          </div>

          <MyPartChip myPart={myPart} onClick={() => setMenuOpen(true)} />
          <TempoChip tempo={tempo} />

          {/* Transpose control — shown via menu toggle or when transposition is non-zero */}
          {showTranspose && (
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => onTranspose(-1)}
                className="perform-btn"
                aria-label={t("perform.transposeDown")}
              >
                −
              </button>
              <span className="min-w-[2ch] text-center text-sm font-medium text-text-muted tabular-nums">
                {transposition === 0
                  ? "0"
                  : transposition > 0
                    ? `+${transposition}`
                    : transposition}
              </span>
              <button
                type="button"
                onClick={() => onTranspose(1)}
                className="perform-btn"
                aria-label={t("perform.transposeUp")}
              >
                +
              </button>
            </div>
          )}

          {/* Auto-scroll: start/pause + speed */}
          <div className="flex shrink-0 items-center gap-0.5">
            {showScrollSpeed && (
              <>
                <button
                  type="button"
                  onClick={() => onScrollSpeed(-1)}
                  className="perform-btn"
                  aria-label={t("performStage.scrollSlower")}
                >
                  −
                </button>
                <span
                  className={`min-w-[2ch] text-center text-sm font-medium tabular-nums ${
                    scrollSpeedDerived ? "text-text-faint" : "text-text-muted"
                  }`}
                  title={
                    scrollSpeedDerived
                      ? t("performStage.scrollSpeedAuto")
                      : t("performStage.scrollSpeedLabel")
                  }
                >
                  {scrollSpeed === null ? "–" : Math.round(scrollSpeed)}
                </span>
                <button
                  type="button"
                  onClick={() => onScrollSpeed(1)}
                  className="perform-btn"
                  aria-label={t("performStage.scrollFaster")}
                >
                  +
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onToggleAutoScroll}
              className={`perform-btn ${autoScrolling ? "text-accent" : ""}`}
              aria-label={
                autoScrolling
                  ? t("performStage.pauseAutoScroll")
                  : t("performStage.startAutoScroll")
              }
              aria-pressed={autoScrolling}
            >
              {autoScrolling ? "❚❚" : "▶\uFE0E"}
            </button>
          </div>

          {/* Navigation + menu */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={isFirst}
              className="perform-btn perform-nav"
              aria-label={t("a11y.previousSong")}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={isLast}
              className="perform-btn perform-nav"
              aria-label={t("a11y.nextSong")}
            >
              ›
            </button>

            {/* 3-dot menu */}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="perform-btn"
                aria-label={t("a11y.moreOptions")}
                aria-expanded={menuOpen}
                aria-haspopup="true"
              >
                ⋮
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 max-h-[80dvh] min-w-40 overflow-y-auto rounded-md border border-border bg-bg-surface py-1 shadow-lg">
                  <MyPartMenu myPart={myPart} />
                  {song && (
                    <button
                      type="button"
                      onClick={() => {
                        onEditMyNote();
                        setMenuOpen(false);
                      }}
                      className="block w-full px-4 py-2.5 text-left text-base text-text hover:bg-bg-hover"
                    >
                      📌 {hasMyNote ? t("myNotes.edit") : t("myNotes.add")}
                    </button>
                  )}
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
                  <button
                    type="button"
                    onClick={() => {
                      onToggleTranspose();
                      setMenuOpen(false);
                    }}
                    className="block w-full px-4 py-2.5 text-left text-base text-text hover:bg-bg-hover"
                  >
                    {t("perform.transpose")}
                  </button>
                  {fullscreenSupported && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleFullscreen();
                        setMenuOpen(false);
                      }}
                      className="block w-full px-4 py-2.5 text-left text-base text-text hover:bg-bg-hover"
                    >
                      {isFullscreen
                        ? t("performStage.exitFullscreen")
                        : t("performStage.enterFullscreen")}
                    </button>
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
