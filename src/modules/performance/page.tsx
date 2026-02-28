import { useDb } from "@db/provider";
import {
  getSongOverrides,
  loadPreferences,
  resolveSongDisplayPrefs,
  setSongOverrides,
  songDisplayCssVars,
} from "@domain/preferences";
import { Link } from "@swan-io/chicane";
import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ChordPopover } from "./components/chord-popover";
import type { ChordTapInfo } from "./components/chordpro-view";
import { PerformFooter } from "./components/perform-footer";
import { PerformHeader } from "./components/perform-header";
import { PerformHints } from "./components/perform-hints";
import { clearPerformReturn, PerformSidebar } from "./components/perform-sidebar";
import { SongStrip } from "./components/song-strip";
import { useSetlistNavigation } from "./hooks/use-setlist-navigation";
import { useSingleSongNavigation } from "./hooks/use-single-song-navigation";
import { useSwipeStrip } from "./hooks/use-swipe-strip";

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
  const handleChordTap = useCallback((info: ChordTapInfo) => setActiveChord(info), []);

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
        onPrev={swipe.goPrev}
        onNext={swipe.goNext}
        onOpenSidebar={() => setSidebarOpen(true)}
      />
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
      />
      {activeChord && (
        <ChordPopover
          chord={activeChord.chord}
          anchorRect={activeChord.anchorRect}
          instrument={globalPrefs.favoriteInstrument}
          onClose={() => setActiveChord(null)}
        />
      )}
      <PerformFooter
        visible={chromeVisible}
        current={nav.current}
        prevSong={nav.prevSong}
        nextSong={nav.nextSong}
      />
      <PerformHints />
    </div>
  );
}
