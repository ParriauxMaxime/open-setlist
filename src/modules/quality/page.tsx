import { useDb } from "@db/provider";
import type { Song } from "@db/song";
import { analyzeSong, type QualityFlag, type QualityReport } from "@domain/quality";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Card } from "../design-system/components/card";
import { PageHeader } from "../design-system/components/page-header";

interface ScoredSong {
  song: Song;
  report: QualityReport;
}

const CATEGORIES: QualityFlag["category"][] = ["metadata", "structure", "chords"];

function scoreTone(score: number) {
  if (score >= 80) return "success" as const;
  if (score >= 50) return "warning" as const;
  return "danger" as const;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

function FlagGroup({ category, flags }: { category: string; flags: QualityFlag[] }) {
  const { t } = useTranslation();
  const earned = flags.filter((f) => f.passed).reduce((s, f) => s + f.weight, 0);
  const total = flags.reduce((s, f) => s + f.weight, 0);

  return (
    <Card
      title={t(`quality.categories.${category}`)}
      aside={
        <span className="text-xs text-text-faint">{t("quality.points", { earned, total })}</span>
      }
    >
      {flags.map((flag) => (
        <div key={flag.id} className="flex items-center gap-2 px-4 py-2 text-sm">
          <span className={flag.passed ? "text-success" : "text-danger"}>
            {flag.passed ? "+" : "-"}
          </span>
          <span className={flag.passed ? "text-text" : "text-text-muted"}>
            {t(`quality.flags.${flag.id}`)}
          </span>
          <span className="ml-auto shrink-0 text-xs text-text-faint">
            {t("quality.weight", { count: flag.weight })}
          </span>
        </div>
      ))}
    </Card>
  );
}

export function QualityPage() {
  const { t } = useTranslation();
  const db = useDb();
  const songs = useLiveQuery(() => db.songs.toArray(), [db]) ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scored: ScoredSong[] = useMemo(
    () =>
      songs
        .map((song) => ({ song, report: analyzeSong(song) }))
        .sort((a, b) => a.report.score - b.report.score),
    [songs],
  );

  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((s, r) => s + r.report.score, 0) / scored.length)
      : 0;

  const selected = scored.find((s) => s.song.id === selectedId);

  return (
    <div className="p-page">
      <PageHeader
        title={t("quality.title")}
        subtitle={
          <>
            {t("sync.songCount", { count: scored.length })} · {t("quality.average")}{" "}
            <span className={`font-semibold ${scoreColor(avgScore)}`}>{avgScore}%</span>
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <Card>
            {scored.map(({ song, report }) => (
              <button
                key={song.id}
                type="button"
                aria-pressed={song.id === selectedId}
                onClick={() => setSelectedId(song.id === selectedId ? null : song.id)}
                className={[
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg",
                  song.id === selectedId ? "bg-accent-muted" : "hover:bg-bg-hover",
                ].join(" ")}
              >
                <span className="w-12 shrink-0 text-center">
                  <Badge tone={scoreTone(report.score)}>{report.score}%</Badge>
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-text">{song.title}</span>
                <span className="shrink-0 truncate text-xs text-text-faint">
                  {song.artist || "—"}
                </span>
              </button>
            ))}

            {scored.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-text-muted">{t("quality.empty")}</p>
            )}
          </Card>
        </div>

        {selected && (
          <div className="w-full shrink-0 lg:sticky lg:top-4 lg:w-80">
            <div className="mb-4">
              <h2 className="text-lg font-bold">{selected.song.title}</h2>
              {selected.song.artist && (
                <p className="text-sm text-text-muted">{selected.song.artist}</p>
              )}
              <p className={`mt-1 text-2xl font-bold ${scoreColor(selected.report.score)}`}>
                {selected.report.score}%
              </p>
            </div>

            {CATEGORIES.map((category) => (
              <FlagGroup
                key={category}
                category={category}
                flags={selected.report.flags.filter((f) => f.category === category)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
