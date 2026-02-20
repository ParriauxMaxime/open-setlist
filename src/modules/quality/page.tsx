import { useDb } from "@db/provider";
import type { Song } from "@db/song";
import { analyzeSong, type QualityFlag, type QualityReport } from "@domain/quality";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";

interface ScoredSong {
  song: Song;
  report: QualityReport;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-danger";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-success/15";
  if (score >= 50) return "bg-warning/15";
  return "bg-danger/15";
}

function FlagIcon({ passed }: { passed: boolean }) {
  return <span className={passed ? "text-success" : "text-danger"}>{passed ? "+" : "-"}</span>;
}

function FlagGroup({ category, flags }: { category: string; flags: QualityFlag[] }) {
  const earned = flags.filter((f) => f.passed).reduce((s, f) => s + f.weight, 0);
  const total = flags.reduce((s, f) => s + f.weight, 0);

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
        {category} ({earned}/{total} pts)
      </h4>
      <ul className="flex flex-col gap-1">
        {flags.map((flag) => (
          <li key={flag.id} className="flex items-center gap-2 text-sm">
            <FlagIcon passed={flag.passed} />
            <span className={flag.passed ? "text-text" : "text-text-muted"}>{flag.label}</span>
            <span className="ml-auto text-xs text-text-faint">{flag.weight} pts</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QualityPage() {
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
      <h1 className="mb-2 text-2xl font-bold">Song Quality</h1>

      <p className="mb-4 text-sm text-text-muted">
        {scored.length} songs — average score:{" "}
        <span className={`font-semibold ${scoreColor(avgScore)}`}>{avgScore}%</span>
      </p>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Song list */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {scored.map(({ song, report }) => (
            <button
              key={song.id}
              type="button"
              onClick={() => setSelectedId(song.id === selectedId ? null : song.id)}
              className={[
                "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                song.id === selectedId ? "bg-accent-muted text-accent" : "hover:bg-bg-hover",
              ].join(" ")}
            >
              <span
                className={`w-12 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-bold ${scoreBg(report.score)} ${scoreColor(report.score)}`}
              >
                {report.score}%
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-text">{song.title}</span>
              <span className="shrink-0 truncate text-xs text-text-faint">
                {song.artist || "—"}
              </span>
            </button>
          ))}

          {scored.length === 0 && (
            <p className="py-8 text-center text-text-muted">No songs in catalog.</p>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-full shrink-0 rounded-lg border border-border bg-bg-surface p-5 lg:w-80">
            <div className="mb-4">
              <h3 className="text-lg font-bold">{selected.song.title}</h3>
              {selected.song.artist && (
                <p className="text-sm text-text-muted">{selected.song.artist}</p>
              )}
              <p className={`mt-1 text-2xl font-bold ${scoreColor(selected.report.score)}`}>
                {selected.report.score}%
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <FlagGroup
                category="Metadata"
                flags={selected.report.flags.filter((f) => f.category === "metadata")}
              />
              <FlagGroup
                category="Structure"
                flags={selected.report.flags.filter((f) => f.category === "structure")}
              />
              <FlagGroup
                category="Chords"
                flags={selected.report.flags.filter((f) => f.category === "chords")}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
