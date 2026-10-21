import { formatLongDuration } from "@domain/format";
import { FOLLOW_MODE } from "@domain/midi/settings";
import { setLabel } from "@domain/perform-tempo";
import { loadPreferences } from "@domain/preferences";
import { setlistDuration } from "@domain/setlist-duration";
import { resolveTechNote } from "@domain/tech-notes";
import { Link } from "@swan-io/chicane";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { useFollowLeader } from "../performance/hooks/use-follow-leader";
import { useSetlistNavigation } from "../performance/hooks/use-setlist-navigation";
import { useWakeLock } from "../performance/hooks/use-wake-lock";
import { useReportStage } from "../shared/hooks/use-companion-link";
import { CrewFooter } from "./components/crew-footer";
import { CrewHeader } from "./components/crew-header";
import { CrewSongRow } from "./components/crew-song-row";
import { useCrewClock } from "./hooks/use-crew-clock";

interface CrewPageProps {
  setlistId: string;
}

/** For the sound and light engineers: the running order, the tech cues, the time left. */
export function CrewPage({ setlistId }: CrewPageProps) {
  const { t } = useTranslation();
  const nav = useSetlistNavigation(setlistId);
  const { setlist, songs, flatSongs, currentIndex, setCurrentIndex } = nav;
  const themeAttr = useMemo(() => (loadPreferences().performForceDark ? "dark" : undefined), []);
  const listRef = useRef<HTMLDivElement>(null);

  useWakeLock();
  const follow = useFollowLeader({
    setlistId,
    flatSongs,
    currentIndex,
    setCurrentIndex,
    forceMode: FOLLOW_MODE.follow,
  });
  useReportStage({
    setlistId,
    songId: flatSongs[currentIndex]?.songId,
    index: currentIndex,
    follow: follow.mode,
  });
  const clock = useCrewClock(currentIndex);

  // biome-ignore lint/correctness/useExhaustiveDependencies: currentIndex is the trigger
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [currentIndex]);

  const durations = useMemo(
    () => flatSongs.map((entry) => songs?.get(entry.songId)?.duration),
    [flatSongs, songs],
  );
  const songList = useMemo(() => [...(songs?.values() ?? [])], [songs]);

  if (nav.notFound) {
    return (
      <CrewMessage theme={themeAttr}>
        <p className="text-text-muted">{t("setlist.notFound")}</p>
        <Link to={Router.Setlists()} className="text-accent hover:text-accent-hover">
          {t("setlist.backToSetlists")}
        </Link>
      </CrewMessage>
    );
  }

  if (!setlist || !songs) {
    return (
      <CrewMessage theme={themeAttr}>
        <p className="text-text-muted">{t("common.loading")}</p>
      </CrewMessage>
    );
  }

  if (flatSongs.length === 0) {
    return (
      <CrewMessage theme={themeAttr}>
        <p className="text-text-muted">{t("techSheet.noSongs")}</p>
        <Link
          to={Router.SetlistEdit({ setlistId })}
          className="text-accent hover:text-accent-hover"
        >
          {t("perform.editSetlist")}
        </Link>
      </CrewMessage>
    );
  }

  const total = setlistDuration(
    flatSongs.map((entry) => entry.songId),
    songList,
  ).total;
  const select = (index: number) => {
    setCurrentIndex(index);
    clock.restart();
  };

  let offset = 0;

  return (
    <div className="perform flex h-dvh flex-col" data-theme={themeAttr}>
      <CrewHeader
        setlist={setlist}
        totalSeconds={total}
        currentIndex={currentIndex}
        follow={follow}
      />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 py-4">
          {setlist.notes?.trim() && (
            <section className="mx-4 rounded-lg border border-border bg-bg-surface px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-faint">
                {t("crew.setlistNotes")}
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-base text-text">{setlist.notes}</p>
            </section>
          )}
          {setlist.sets.map((set, setIndex) => {
            const first = offset;
            offset += set.songIds.length;
            if (set.songIds.length === 0) return null;
            const setLength = setlistDuration(set.songIds, songList).total;
            const name = setLabel({ setName: set.name, setIndex }, (n) =>
              t("performTempo.setNumber", { number: n }),
            );
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: sets have no id, their order is their identity
              <section key={setIndex}>
                <div className="px-4 pb-1">
                  <h2 className="text-sm font-semibold text-text">
                    {[
                      name,
                      t("setlist.songCount", { count: set.songIds.length }),
                      setLength > 0 && formatLongDuration(setLength),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </h2>
                  {set.notes?.trim() && (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-muted">
                      {set.notes}
                    </p>
                  )}
                </div>
                <ol className="divide-y divide-border border-y border-border bg-bg-surface">
                  {set.songIds.map((songId, i) => {
                    const index = first + i;
                    const song = songs?.get(songId);
                    return (
                      <CrewSongRow
                        key={`${index}-${songId}`}
                        number={index + 1}
                        song={song}
                        techNote={song && resolveTechNote(setlist, song)}
                        current={index === currentIndex}
                        onSelect={() => select(index)}
                      />
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
      <CrewFooter
        title={nav.currentSong?.title}
        durations={durations}
        currentIndex={currentIndex}
        clock={clock}
      />
    </div>
  );
}

function CrewMessage({ theme, children }: { theme: string | undefined; children: ReactNode }) {
  return (
    <div
      className="perform flex min-h-dvh flex-col items-center justify-center gap-4"
      data-theme={theme}
    >
      {children}
    </div>
  );
}
