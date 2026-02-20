import type { Song } from "@db/song";
import { parse } from "./chordpro/parser";

export interface QualityFlag {
  id: string;
  label: string;
  passed: boolean;
  weight: number;
  category: "metadata" | "structure" | "chords";
}

export interface QualityReport {
  score: number;
  flags: QualityFlag[];
}

export function analyzeSong(song: Song): QualityReport {
  const parsed = parse(song.content);
  const { metadata, sections } = parsed;

  const flags: QualityFlag[] = [];

  // ── Metadata (30 pts) ──

  flags.push({
    id: "has-artist",
    label: "Has artist",
    passed: Boolean(song.artist || metadata.artist),
    weight: 6,
    category: "metadata",
  });

  flags.push({
    id: "has-key",
    label: "Has key",
    passed: Boolean(song.key || metadata.key),
    weight: 6,
    category: "metadata",
  });

  flags.push({
    id: "has-bpm",
    label: "Has BPM",
    passed: Boolean(song.bpm || metadata.bpm),
    weight: 6,
    category: "metadata",
  });

  flags.push({
    id: "has-duration",
    label: "Has duration",
    passed: Boolean(song.duration || metadata.duration),
    weight: 4,
    category: "metadata",
  });

  flags.push({
    id: "has-tags",
    label: "Has tags",
    passed: song.tags.length > 0 || Boolean(metadata.tags),
    weight: 4,
    category: "metadata",
  });

  flags.push({
    id: "has-link",
    label: "Has a link (YouTube, Spotify...)",
    passed: Boolean(
      song.links?.youtube || song.links?.spotify || song.links?.deezer || metadata.youtube,
    ),
    weight: 4,
    category: "metadata",
  });

  // ── Structure (40 pts) ──

  const sectionTypes = sections.map((s) => s.type);

  flags.push({
    id: "has-verse",
    label: "Has verse section",
    passed: sectionTypes.includes("verse"),
    weight: 10,
    category: "structure",
  });

  flags.push({
    id: "has-chorus",
    label: "Has chorus section",
    passed: sectionTypes.includes("chorus"),
    weight: 10,
    category: "structure",
  });

  flags.push({
    id: "has-bridge-or-other",
    label: "Has bridge, intro, or other section",
    passed: sectionTypes.some(
      (t) => t === "bridge" || t === "intro" || t === "outro" || t === "solo" || t === "tab",
    ),
    weight: 5,
    category: "structure",
  });

  const hasOrphan = sections.some((s) => s.type === "custom");
  flags.push({
    id: "no-orphan-lines",
    label: "No orphan lines (outside sections)",
    passed: !hasOrphan,
    weight: 10,
    category: "structure",
  });

  const totalSections = sections.filter((s) => s.type !== "custom").length;
  flags.push({
    id: "multiple-sections",
    label: "Multiple labeled sections (3+)",
    passed: totalSections >= 3,
    weight: 5,
    category: "structure",
  });

  // ── Chords (30 pts) ──

  const allLines = sections.flatMap((s) => s.lines);
  const nonEmptyLines = allLines.filter((l) => l.segments.some((s) => s.text.trim() || s.chord));
  const linesWithChords = nonEmptyLines.filter((l) => l.segments.some((s) => s.chord));
  const linesWithLyrics = nonEmptyLines.filter((l) =>
    l.segments.some((s) => s.text.trim().length > 0),
  );
  const lyricsWithChords = linesWithLyrics.filter((l) =>
    l.segments.some((s) => s.chord && s.text.trim().length > 0),
  );

  flags.push({
    id: "has-chords",
    label: "Has chords",
    passed: linesWithChords.length > 0,
    weight: 10,
    category: "chords",
  });

  const chordCoverage =
    linesWithLyrics.length > 0 ? lyricsWithChords.length / linesWithLyrics.length : 0;
  flags.push({
    id: "chord-coverage",
    label: "Good chord coverage (>50% of lyric lines)",
    passed: chordCoverage > 0.5,
    weight: 10,
    category: "chords",
  });

  const uniqueChords = new Set(
    allLines.flatMap((l) => l.segments.filter((s) => s.chord).map((s) => s.chord)),
  );
  flags.push({
    id: "chord-variety",
    label: "Chord variety (4+ unique chords)",
    passed: uniqueChords.size >= 4,
    weight: 10,
    category: "chords",
  });

  // ── Score ──

  const totalWeight = flags.reduce((sum, f) => sum + f.weight, 0);
  const earnedWeight = flags.filter((f) => f.passed).reduce((sum, f) => sum + f.weight, 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  return { score, flags };
}
