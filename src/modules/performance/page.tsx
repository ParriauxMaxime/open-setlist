import { loadPreferences, resolveSongDisplayPrefs, songDisplayCssVars } from "@domain/preferences";
import { Link } from "@swan-io/chicane";
import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ChordPopover } from "./components/chord-popover";
import type { ChordTapInfo } from "./components/chordpro-view";
import { PerformFooter } from "./components/perform-footer";
import { PerformHeader } from "./components/perform-header";
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
  const setlistNav = useSetlistNavigation(setlistId ?? "");
  const singleNav = useSingleSongNavigation(songId ?? "");
  const nav = setlistId ? setlistNav : singleNav;

  const [chromeVisible, setChromeVisible] = useState(true);
  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeChord, setActiveChord] = useState<ChordTapInfo | null>(null);
  const handleChordTap = useCallback((info: ChordTapInfo) => setActiveChord(info), []);

  // Load global prefs once
  const globalPrefs = useMemo(() => loadPreferences(), []);
  const forceDark = globalPrefs.performForceDark;

  // Clear return marker — we're back in perform mode
  clearPerformReturn();

  const loaded = setlistId ? !!setlistNav.setlist : singleNav.loaded;

  const swipe = useSwipeStrip({
    currentIndex: nav.currentIndex,
    setCurrentIndex: nav.setCurrentIndex,
    totalItems: nav.flatSongs.length,
    onToggleChrome: toggleChrome,
    enabled: loaded && nav.flatSongs.length > 0,
  });

  // Compute per-song CSS custom-property overrides
  const prevSongStyle = useMemo(
    () =>
      songDisplayCssVars(resolveSongDisplayPrefs(globalPrefs, nav.prevSong?.id)) as CSSProperties,
    [globalPrefs, nav.prevSong?.id],
  );
  const currentSongStyle = useMemo(
    () =>
      songDisplayCssVars(
        resolveSongDisplayPrefs(globalPrefs, nav.currentSong?.id),
      ) as CSSProperties,
    [globalPrefs, nav.currentSong?.id],
  );
  const nextSongStyle = useMemo(
    () =>
      songDisplayCssVars(resolveSongDisplayPrefs(globalPrefs, nav.nextSong?.id)) as CSSProperties,
    [globalPrefs, nav.nextSong?.id],
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
    </div>
  );
}
