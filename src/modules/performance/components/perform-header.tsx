import type { Song } from "@db";
import { FOLLOW_MODE } from "@domain/midi/settings";
import { SETTINGS_SECTION } from "@domain/settings-sections";
import { Link } from "@swan-io/chicane";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import type { FollowLeader } from "../hooks/use-follow-leader";
import type { MyPart } from "../hooks/use-my-part";
import { STAGE_MIDI_STATE, type StageMidi } from "../hooks/use-stage-midi";
import type { Tempo } from "../hooks/use-tempo";
import { KeyChips } from "./key-chips";
import { MyPartChip, MyPartMenu } from "./my-part-menu";
import { ScrollSpeedControl, TransposeControl } from "./stage-controls";
import { FollowChip, FollowMenu, MidiChip } from "./stage-midi";
import { STAGE_TOOLS_ID, StageToolsDrawer } from "./stage-tools-drawer";
import { StageViewMenu } from "./stage-view-menu";
import { TempoChip } from "./tempo-chip";

interface PerformHeaderProps {
  visible: boolean;
  song: Song | undefined;
  /** Changes with the song on stage: the phone tools drawer closes. */
  songKey: number;
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
  onOpenSidebar: () => void;
  myPart: MyPart;
  hasMyNote: boolean;
  onEditMyNote: () => void;
  /** Leaving for the song's editor, whose Save comes back here. */
  onEditSong: () => void;
  midi: StageMidi;
  follow: FollowLeader;
  onShowHelp: () => void;
  /** Id of the sheet shown for the song; undefined = its chart. */
  stageView: string | undefined;
  onStageView: (view: string) => void;
}

const ALERT_DOT = { danger: "bg-danger", warning: "bg-warning" } as const;

/** On phones the MIDI and Follow chips sit in the drawer: the ⋮ button carries their alarm. */
function stageAlert(midi: StageMidi, follow: FollowLeader): keyof typeof ALERT_DOT | undefined {
  if (midi.active) {
    if (midi.state === STAGE_MIDI_STATE.badCode || midi.state === STAGE_MIDI_STATE.failed) {
      return "danger";
    }
    if (midi.state === STAGE_MIDI_STATE.disconnected) return "warning";
  }
  if (follow.mode !== FOLLOW_MODE.off && !follow.connected) return "warning";
  return undefined;
}

export function PerformHeader({
  visible,
  song,
  songKey,
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
  onOpenSidebar,
  myPart,
  hasMyNote,
  onEditMyNote,
  onEditSong,
  midi,
  follow,
  onShowHelp,
  stageView,
  onStageView,
}: PerformHeaderProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const showTranspose = transposeOpen || transposition !== 0;
  const alert = stageAlert(midi, follow);
  const title = song?.title ?? t("common.unknown");

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

  // A tap outside only closes the drawer: it does not also hide the bar or open a chord
  useEffect(() => {
    if (!toolsOpen) return;
    const handlePointer = (e: PointerEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      setToolsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolsOpen(false);
    };
    window.addEventListener("pointerdown", handlePointer, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointer, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [toolsOpen]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: songKey is the intentional trigger
  useEffect(() => {
    setToolsOpen(false);
  }, [songKey]);

  return (
    <div ref={headerRef} className="perform-header" data-visible={visible}>
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

          {/* Phones: the title opens the song's tools */}
          <button
            type="button"
            onClick={() => setToolsOpen((v) => !v)}
            aria-expanded={toolsOpen}
            aria-controls={STAGE_TOOLS_ID}
            className="-my-1 min-w-0 flex-1 rounded-md px-2 py-1 text-left active:bg-bg-hover sm:hidden"
          >
            <span className="flex items-center gap-1.5">
              <span className="truncate text-lg font-bold leading-tight">{title}</span>
              <span
                aria-hidden="true"
                className={`shrink-0 text-text-muted transition-transform ${toolsOpen ? "rotate-180" : ""}`}
              >
                ⌄
              </span>
            </span>
            {song?.artist && (
              <span className="block truncate text-sm text-text-muted">{song.artist}</span>
            )}
            <span className="sr-only">{t("performStage.songTools")}</span>
          </button>

          {/* Song info */}
          <div className="hidden min-w-0 flex-1 sm:block">
            <div className="truncate text-lg font-bold leading-tight">{title}</div>
            {song?.artist && <div className="truncate text-sm text-text-muted">{song.artist}</div>}
            <KeyChips song={song} transposition={transposition} partView={myPart.view} />
          </div>

          <div className="hidden sm:contents">
            <FollowChip follow={follow} onClick={() => setMenuOpen(true)} />
            <MidiChip midi={midi} />
            <MyPartChip myPart={myPart} onClick={() => setMenuOpen(true)} />
            <TempoChip tempo={tempo} />

            {/* Transpose control — shown via menu toggle or when transposition is non-zero */}
            {showTranspose && (
              <div className="flex shrink-0 items-center gap-0.5">
                <TransposeControl transposition={transposition} onTranspose={onTranspose} />
              </div>
            )}
          </div>

          {/* Auto-scroll: start/pause + speed */}
          <div className="flex shrink-0 items-center gap-0.5">
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
              {autoScrolling ? "❚❚" : "▶︎"}
            </button>
          </div>

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="perform-btn relative"
              aria-expanded={menuOpen}
              aria-haspopup="true"
            >
              <span aria-hidden="true">⋮</span>
              <span className="sr-only">{t("a11y.moreOptions")}</span>
              {alert && (
                <>
                  <span
                    aria-hidden="true"
                    className={`absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full sm:hidden ${ALERT_DOT[alert]}`}
                  />
                  <span className="sr-only sm:hidden">{t("performStage.toolsAlert")}</span>
                </>
              )}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 max-h-[80dvh] min-w-40 overflow-y-auto rounded-md border border-border bg-bg-surface py-1 shadow-lg">
                {/* What a musician reaches for during a song comes first */}
                <div className="border-b border-border pb-1">
                  {/* Phones transpose from the tools drawer */}
                  <button
                    type="button"
                    onClick={() => {
                      onToggleTranspose();
                      setMenuOpen(false);
                    }}
                    className="hidden w-full px-4 py-3 text-left text-base text-text hover:bg-bg-hover sm:block"
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
                    onClick={onEditSong}
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
        {toolsOpen && (
          <StageToolsDrawer
            song={song}
            transposition={transposition}
            onTranspose={onTranspose}
            tempo={tempo}
            showScrollSpeed={showScrollSpeed}
            scrollSpeed={scrollSpeed}
            scrollSpeedDerived={scrollSpeedDerived}
            onScrollSpeed={onScrollSpeed}
            myPart={myPart}
            midi={midi}
            follow={follow}
            onOpenMenu={() => setMenuOpen(true)}
          />
        )}
      </div>
    </div>
  );
}
