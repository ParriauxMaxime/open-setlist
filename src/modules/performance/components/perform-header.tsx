import type { Song } from "@db";
import { SETTINGS_SECTION } from "@domain/settings-sections";
import { Link } from "@swan-io/chicane";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import type { FollowLeader } from "../hooks/use-follow-leader";
import type { MyPart } from "../hooks/use-my-part";
import type { StageMidi } from "../hooks/use-stage-midi";
import type { Tempo } from "../hooks/use-tempo";
import { KeyChips } from "./key-chips";
import { MyPartChip, MyPartMenu } from "./my-part-menu";
import { FollowChip, FollowMenu, MidiChip } from "./stage-midi";
import { StageViewMenu } from "./stage-view-menu";
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
  midi: StageMidi;
  follow: FollowLeader;
  onShowHelp: () => void;
  /** Id of the sheet shown for the song; undefined = its chart. */
  stageView: string | undefined;
  onStageView: (view: string) => void;
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
  midi,
  follow,
  onShowHelp,
  stageView,
  onStageView,
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
        <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
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

          <FollowChip follow={follow} onClick={() => setMenuOpen(true)} />
          <MidiChip midi={midi} />
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
            {/* Phones keep the speed in the ⋮ menu, the bar is full */}
            {showScrollSpeed && (
              <div className="hidden items-center gap-0.5 sm:flex">
                <ScrollSpeedControl
                  speed={scrollSpeed}
                  derived={scrollSpeedDerived}
                  onChange={onScrollSpeed}
                />
              </div>
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
                  {showScrollSpeed && (
                    <div className="flex items-center justify-between gap-3 border-b border-border py-1 pr-2 pl-4 sm:hidden">
                      <span className="text-base text-text">
                        {t("performStage.scrollSpeedLabel")}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <ScrollSpeedControl
                          speed={scrollSpeed}
                          derived={scrollSpeedDerived}
                          onChange={onScrollSpeed}
                        />
                      </div>
                    </div>
                  )}
                  {/* What a musician reaches for during a song comes first */}
                  <div className="border-b border-border pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        onToggleTranspose();
                        setMenuOpen(false);
                      }}
                      className="block w-full px-4 py-3 text-left text-base text-text hover:bg-bg-hover"
                    >
                      {t("perform.transpose")}
                    </button>
                    {song && (
                      <button
                        type="button"
                        onClick={() => {
                          onEditMyNote();
                          setMenuOpen(false);
                        }}
                        className="block w-full px-4 py-3 text-left text-base text-text hover:bg-bg-hover"
                      >
                        📌 {hasMyNote ? t("myNotes.edit") : t("myNotes.add")}
                      </button>
                    )}
                    {fullscreenSupported && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleFullscreen();
                          setMenuOpen(false);
                        }}
                        className="block w-full px-4 py-3 text-left text-base text-text hover:bg-bg-hover"
                      >
                        {isFullscreen
                          ? t("performStage.exitFullscreen")
                          : t("performStage.enterFullscreen")}
                      </button>
                    )}
                  </div>
                  <MyPartMenu myPart={myPart} />
                  {song?.attachments && song.attachments.length > 0 && (
                    <StageViewMenu
                      attachments={song.attachments}
                      current={stageView}
                      onChange={onStageView}
                    />
                  )}
                  {follow.available && <FollowMenu follow={follow} />}
                  {/* Leaves the stage: kept apart, at the bottom */}
                  <div className="px-4 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-text-faint">
                    {t("perform.editGroup")}
                  </div>
                  {song && (
                    <Link
                      to={Router.SongEdit({ songId: song.id })}
                      className="block w-full px-4 py-3 text-left text-base text-text hover:bg-bg-hover"
                    >
                      {t("perform.editSong")}
                    </Link>
                  )}
                  {setlistId && (
                    <Link
                      to={Router.SetlistEdit({ setlistId })}
                      className="block w-full px-4 py-3 text-left text-base text-text hover:bg-bg-hover"
                    >
                      {t("perform.editSetlist")}
                    </Link>
                  )}
                  <Link
                    to={Router.SettingsSection({ section: SETTINGS_SECTION.display })}
                    className="block w-full px-4 py-3 text-left text-base text-text hover:bg-bg-hover"
                  >
                    {t("perform.displaySettings")}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      onShowHelp();
                      setMenuOpen(false);
                    }}
                    className="block w-full px-4 py-3 text-left text-base text-text-muted hover:bg-bg-hover"
                  >
                    {t("perform.help")}
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

interface ScrollSpeedControlProps {
  speed: number | null;
  /** True when the speed is derived from duration rather than stored on the song. */
  derived: boolean;
  onChange: (delta: number) => void;
}

/** Auto-scroll speed − n +, in the bar on wider screens, in the ⋮ menu on phones. */
function ScrollSpeedControl({ speed, derived, onChange }: ScrollSpeedControlProps) {
  const { t } = useTranslation();
  const shown = speed === null ? "–" : Math.round(speed);

  return (
    <>
      <button
        type="button"
        onClick={() => onChange(-1)}
        className="perform-btn"
        aria-label={t("performStage.scrollSlower")}
      >
        −
      </button>
      <output
        className={`flex min-w-[2ch] flex-col items-center text-sm font-medium tabular-nums leading-tight ${
          derived ? "text-text-faint" : "text-text-muted"
        }`}
        title={derived ? t("performStage.scrollSpeedAuto") : t("performStage.scrollSpeedLabel")}
        aria-label={t(
          derived ? "performStage.scrollSpeedValueAuto" : "performStage.scrollSpeedValue",
          { speed: shown },
        )}
      >
        {shown}
        <span aria-hidden="true" className="hidden text-xs font-normal md:block">
          {t("performStage.scrollShort")}
        </span>
      </output>
      <button
        type="button"
        onClick={() => onChange(1)}
        className="perform-btn"
        aria-label={t("performStage.scrollFaster")}
      >
        +
      </button>
    </>
  );
}
