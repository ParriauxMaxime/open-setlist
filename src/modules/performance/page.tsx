import type { Song } from "@db";
import { useDb } from "@db/provider";
import { parse } from "@domain/chordpro/parser";
import { setMyNote } from "@domain/my-notes";
import { SCROLL_SPEED_DEFAULT, stepScrollSpeed } from "@domain/perform-stage";
import {
  getSongOverrides,
  loadPreferences,
  resolveSongDisplayPrefs,
  setSongOverrides,
  songDisplayCssVars,
} from "@domain/preferences";
import { useActiveProfileId } from "@domain/profiles";
import { Link } from "@swan-io/chicane";
import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { useMyNotes } from "../shared/hooks/use-my-notes";
import { ChordPopover } from "./components/chord-popover";
import type { ChordTapInfo } from "./components/chordpro-view";
import { MyNoteCard } from "./components/my-note-card";
import { MyNoteEditor } from "./components/my-note-editor";
import { PerformFooter } from "./components/perform-footer";
import { PerformHeader } from "./components/perform-header";
import { PerformHints } from "./components/perform-hints";
import { clearPerformReturn, PerformSidebar } from "./components/perform-sidebar";
import { SetInterstitial } from "./components/set-interstitial";
import { SongStrip } from "./components/song-strip";
import { TempoOverlay } from "./components/tempo-overlay";
import { useAutoScroll } from "./hooks/use-auto-scroll";
import { useFullscreen } from "./hooks/use-fullscreen";
import { useMyPart } from "./hooks/use-my-part";
import { usePerformKeys } from "./hooks/use-perform-keys";
import { useSetlistNavigation } from "./hooks/use-setlist-navigation";
import { useSingleSongNavigation } from "./hooks/use-single-song-navigation";
import { useSwipeStrip } from "./hooks/use-swipe-strip";
import { useTempo } from "./hooks/use-tempo";
import { useWakeLock } from "./hooks/use-wake-lock";

interface PerformPageProps {
  setlistId?: string;
  songId?: string;
}

export function PerformPage({ setlistId, songId }: PerformPageProps) {
  const { t } = useTranslation();
  const db = useDb();
  const setlistNav = useSetlistNavigation(setlistId ?? "");
  const singleNav = useSingleSongNavigation(songId ?? "");
  const nav = setlistId ? setlistNav : singleNav;

  const [chromeVisible, setChromeVisible] = useState(true);
  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transposeOpen, setTransposeOpen] = useState(false);
  const toggleTranspose = useCallback(() => setTransposeOpen((v) => !v), []);
  const [activeChord, setActiveChord] = useState<ChordTapInfo | null>(null);
  // The song's own `{define}` voicings override the built-in diagrams
  const chordDefinitions = useMemo(
    () => parse(nav.currentSong?.content ?? "").chordDefinitions,
    [nav.currentSong?.content],
  );
  const myPart = useMyPart(nav.flatSongs);
  const handleChordTap = useCallback((info: ChordTapInfo) => setActiveChord(info), []);

  const profileId = useActiveProfileId();
  const myNotes = useMyNotes(profileId);
  // Songs whose note is folded to a pin, for this session only
  const [foldedNotes, setFoldedNotes] = useState<ReadonlySet<string>>(() => new Set());
  const setNoteFolded = useCallback((id: string, folded: boolean) => {
    setFoldedNotes((prev) => {
      const next = new Set(prev);
      if (folded) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  // Bound to the song it was opened for, even if the musician swipes meanwhile
  const [noteEditing, setNoteEditing] = useState<Song | null>(null);
  const saveNote = useCallback(
    (text: string) => {
      if (!noteEditing) return;
      setMyNote(profileId, noteEditing.id, text);
      setNoteFolded(noteEditing.id, false);
      setNoteEditing(null);
    },
    [noteEditing, profileId, setNoteFolded],
  );
  const renderNote = (song: Song) => {
    const note = myNotes[song.id];
    if (!note) return null;
    const folded = foldedNotes.has(song.id);
    return (
      <MyNoteCard
        text={note.text}
        collapsed={folded}
        onToggleCollapsed={() => setNoteFolded(song.id, !folded)}
        onEdit={() => setNoteEditing(song)}
      />
    );
  };

  const handleTranspose = useCallback(
    async (delta: number) => {
      const song = nav.currentSong;
      if (!song) return;
      const raw = (song.transposition ?? 0) + delta;
      const transposition = raw === 12 || raw === -12 ? 0 : raw;
      await db.songs.update(song.id, {
        transposition,
        updatedAt: Date.now(),
      });
    },
    [nav.currentSong, db],
  );

  // Load global prefs once
  const globalPrefs = useMemo(() => loadPreferences(), []);
  const forceDark = globalPrefs.performForceDark;

  // Bump to force CSS-var recomputation after a per-song override change
  const [overrideVersion, setOverrideVersion] = useState(0);
  const handleDoubleTapScale = useCallback(
    (dir: "up" | "down") => {
      const id = nav.currentSong?.id;
      if (!id) return;
      const current = getSongOverrides(id).globalScale ?? globalPrefs.globalScale;
      const next =
        Math.round(Math.max(0.5, Math.min(3, current + (dir === "up" ? 0.1 : -0.1))) * 10) / 10;
      setSongOverrides(id, { globalScale: next });
      setOverrideVersion((v) => v + 1);
    },
    [nav.currentSong?.id, globalPrefs.globalScale],
  );

  // Clear return marker — we're back in perform mode
  clearPerformReturn();

  const loaded = setlistId ? !!setlistNav.setlist : singleNav.loaded;

  const swipe = useSwipeStrip({
    currentIndex: nav.currentIndex,
    setCurrentIndex: nav.setCurrentIndex,
    totalItems: nav.flatSongs.length,
    onToggleChrome: toggleChrome,
    enabled: loaded && nav.flatSongs.length > 0,
    onDoubleTapScale: handleDoubleTapScale,
    doubleTapScaleEnabled: globalPrefs.performDoubleTapScale,
  });

  useWakeLock();
  const fullscreen = useFullscreen();

  const autoScroll = useAutoScroll({
    panelRef: swipe.currentPanelRef,
    songKey: nav.currentSong?.id,
    scrollSpeed: nav.currentSong?.scrollSpeed,
    duration: nav.currentSong?.duration,
  });
  // Once auto-scroll has been used, keep its speed controls in the header
  const [autoScrollUsed, setAutoScrollUsed] = useState(false);
  const { toggle: toggleAutoScrollRaw, stop: stopAutoScroll } = autoScroll;
  const toggleAutoScroll = useCallback(() => {
    setAutoScrollUsed(true);
    toggleAutoScrollRaw();
  }, [toggleAutoScrollRaw]);
  const autoScrollArmed = autoScrollUsed || nav.currentSong?.scrollSpeed !== undefined;

  const tempo = useTempo({
    bpm: nav.currentSong?.bpm,
    content: nav.currentSong?.content,
    songKey: nav.currentSong?.id,
    // A count-in ends on the song's first downbeat: start scrolling if it's set up
    onCountInEnd: () => {
      if (autoScrollArmed && !autoScroll.active) toggleAutoScroll();
    },
  });

  const currentScrollSpeed = autoScroll.speed;
  const handleScrollSpeed = useCallback(
    async (delta: number) => {
      const song = nav.currentSong;
      if (!song) return;
      await db.songs.update(song.id, {
        scrollSpeed: stepScrollSpeed(currentScrollSpeed ?? SCROLL_SPEED_DEFAULT, delta),
        updatedAt: Date.now(),
      });
    },
    [nav.currentSong, currentScrollSpeed, db],
  );

  usePerformKeys({
    panelRef: swipe.currentPanelRef,
    goPrev: swipe.goPrev,
    goNext: swipe.goNext,
    onToggleChrome: toggleChrome,
    onToggleAutoScroll: toggleAutoScroll,
    onManualNavigation: stopAutoScroll,
  });

  // Compute per-song CSS custom-property overrides
  // biome-ignore lint/correctness/useExhaustiveDependencies: overrideVersion forces recomputation after double-tap scale change
  const prevSongStyle = useMemo(
    () =>
      songDisplayCssVars(resolveSongDisplayPrefs(globalPrefs, nav.prevSong?.id)) as CSSProperties,
    [globalPrefs, nav.prevSong?.id, overrideVersion],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: overrideVersion forces recomputation after double-tap scale change
  const currentSongStyle = useMemo(
    () =>
      songDisplayCssVars(
        resolveSongDisplayPrefs(globalPrefs, nav.currentSong?.id),
      ) as CSSProperties,
    [globalPrefs, nav.currentSong?.id, overrideVersion],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: overrideVersion forces recomputation after double-tap scale change
  const nextSongStyle = useMemo(
    () =>
      songDisplayCssVars(resolveSongDisplayPrefs(globalPrefs, nav.nextSong?.id)) as CSSProperties,
    [globalPrefs, nav.nextSong?.id, overrideVersion],
  );

  const themeAttr = forceDark ? "dark" : undefined;

  if (!loaded) {
    return (
      <div className="perform flex min-h-dvh items-center justify-center" data-theme={themeAttr}>
        <p className="text-text-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (nav.flatSongs.length === 0 && setlistId) {
    return (
      <div
        className="perform flex min-h-dvh flex-col items-center justify-center gap-4"
        data-theme={themeAttr}
      >
        <p className="text-text-muted">{t("perform.noSongsInSetlist")}</p>
        <Link
          to={Router.SetlistEdit({ setlistId })}
          className="text-accent hover:text-accent-hover"
        >
          {t("perform.editSetlist")}
        </Link>
      </div>
    );
  }

  return (
    <div className="perform flex h-dvh flex-col" data-theme={themeAttr}>
      <PerformSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        setlistId={setlistId}
        songId={songId}
      />
      <PerformHeader
        visible={chromeVisible}
        song={nav.currentSong}
        isFirst={nav.isFirst}
        isLast={nav.isLast}
        setlistId={setlistId}
        transposition={nav.currentSong?.transposition ?? 0}
        transposeOpen={transposeOpen}
        onTranspose={handleTranspose}
        onToggleTranspose={toggleTranspose}
        tempo={tempo}
        autoScrolling={autoScroll.active}
        showScrollSpeed={autoScroll.active || autoScrollArmed}
        scrollSpeed={currentScrollSpeed}
        scrollSpeedDerived={autoScroll.isDerived}
        onToggleAutoScroll={toggleAutoScroll}
        onScrollSpeed={handleScrollSpeed}
        fullscreenSupported={fullscreen.supported}
        isFullscreen={fullscreen.isFullscreen}
        onToggleFullscreen={fullscreen.toggle}
        onPrev={swipe.goPrev}
        onNext={swipe.goNext}
        onOpenSidebar={() => setSidebarOpen(true)}
        myPart={myPart}
        hasMyNote={!!(nav.currentSong && myNotes[nav.currentSong.id])}
        onEditMyNote={() => setNoteEditing(nav.currentSong ?? null)}
      />
      {noteEditing && (
        <MyNoteEditor
          key={noteEditing.id}
          songTitle={noteEditing.title}
          initialText={myNotes[noteEditing.id]?.text ?? ""}
          onSave={saveNote}
          onCancel={() => setNoteEditing(null)}
        />
      )}
      <SongStrip
        containerRef={swipe.containerRef}
        stripRef={swipe.stripRef}
        currentPanelRef={swipe.currentPanelRef}
        onClick={swipe.handleClick}
        prevSong={nav.prevSong}
        currentSong={nav.currentSong}
        nextSong={nav.nextSong}
        prevTransposition={nav.prevSong?.transposition}
        currentTransposition={nav.currentSong?.transposition}
        nextTransposition={nav.nextSong?.transposition}
        prevSongStyle={prevSongStyle}
        currentSongStyle={currentSongStyle}
        nextSongStyle={nextSongStyle}
        onChordTap={handleChordTap}
        partView={myPart.view}
        renderNote={renderNote}
      />
      {activeChord && (
        <ChordPopover
          chord={activeChord.chord}
          anchorRect={activeChord.anchorRect}
          instrument={globalPrefs.favoriteInstrument}
          definitions={chordDefinitions}
          onClose={() => setActiveChord(null)}
        />
      )}
      <PerformFooter
        visible={chromeVisible}
        current={nav.current}
        next={setlistId ? nav.flatSongs[nav.currentIndex + 1] : undefined}
        prevSong={nav.prevSong}
        nextSong={nav.nextSong}
        partView={myPart.view}
      />
      <TempoOverlay beats={tempo.beats} />
      {setlistId && <SetInterstitial current={nav.current} />}
      <PerformHints />
    </div>
  );
}
