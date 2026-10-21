/**
 * Chart files against the catalog: which songs are new, which already exist (same title
 * and artist, whatever the case or accents), and how a chart replaces an existing one.
 */

import type { Song } from "@db/song";
import { hasChart } from "../chordpro/has-chart";
import { parse } from "../chordpro/parser";
import { sameText } from "../text";
import { CHART_FILE_WARNING_CODES, type ChartFileWarning, type ImportedChart } from "./chart-files";
import type { ImportedSongFields, ImportMatch, ImportPlan, ImportWrites } from "./setlist-helper";

export function isSameSong(
  a: Pick<Song, "title" | "artist">,
  b: Pick<Song, "title" | "artist">,
): boolean {
  return sameText(a.title, b.title) && sameText(a.artist ?? "", b.artist ?? "");
}

function contentHasChart(content: string | undefined): boolean {
  return content ? hasChart(parse(content)) : false;
}

/**
 * Splits the files' songs into new ones, existing ones without a chart (they get it
 * without asking), and existing ones with a chart (the musician chooses).
 */
export function planChartImport(
  imported: ImportedChart[],
  catalog: Song[],
): ImportPlan<ImportedChart> {
  const plan: ImportPlan<ImportedChart> = { newSongs: [], matches: [], fills: [] };
  for (const item of imported) {
    const existing = catalog.find((song) => isSameSong(song, item.song));
    if (!existing) plan.newSongs.push(item);
    else if (!contentHasChart(existing.content) && contentHasChart(item.song.content)) {
      plan.fills.push({ imported: item, existing });
    } else plan.matches.push({ imported: item, existing });
  }
  return plan;
}

/**
 * The existing song with the file's chart and the details the file has. The band's own
 * settings stay: status, sound codes, scroll speed, links, sheet music, id.
 */
export function replaceWithChart(existing: Song, imported: ImportedSongFields, now: number): Song {
  const fromFile = Object.fromEntries(
    Object.entries(imported).filter(([, value]) => value !== undefined),
  ) as Partial<ImportedSongFields>;
  return {
    ...existing,
    ...fromFile,
    tags: imported.tags.length > 0 ? imported.tags : existing.tags,
    status: existing.status,
    patches: existing.patches,
    scrollSpeed: existing.scrollSpeed ?? imported.scrollSpeed,
    links: existing.links ?? imported.links,
    attachments: existing.attachments,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

export function buildChartImportWrites(
  plan: ImportPlan<ImportedChart>,
  replaceExisting: boolean,
  now: number,
  createId: () => string,
): ImportWrites {
  const added = plan.newSongs.map(({ song }) => ({
    ...song,
    id: createId(),
    createdAt: now,
    updatedAt: now,
  }));
  const replaced = [...plan.fills, ...(replaceExisting ? plan.matches : [])];
  const updated = replaced.map(({ imported, existing }) =>
    replaceWithChart(existing, imported.song, now),
  );
  return { added, updated };
}

export const CHART_SKIP_REASON = {
  noTitle: "noTitle",
  notAChart: "notAChart",
  emptyFile: "emptyFile",
  sameSongTwice: "sameSongTwice",
  alreadyInCatalog: "alreadyInCatalog",
} as const;

export type ChartSkipReason = (typeof CHART_SKIP_REASON)[keyof typeof CHART_SKIP_REASON];

/** File warnings that mean the song was left out, and why. */
const SKIPPING_WARNINGS: Partial<Record<ChartFileWarning["code"], ChartSkipReason>> = {
  [CHART_FILE_WARNING_CODES.missingTitle]: CHART_SKIP_REASON.noTitle,
  [CHART_FILE_WARNING_CODES.unsupportedFile]: CHART_SKIP_REASON.notAChart,
  [CHART_FILE_WARNING_CODES.emptyFile]: CHART_SKIP_REASON.emptyFile,
  [CHART_FILE_WARNING_CODES.duplicateInFile]: CHART_SKIP_REASON.sameSongTwice,
};

export interface SkippedChart {
  file: string;
  title?: string;
  reason: ChartSkipReason;
}

export interface ChartImportSummary {
  added: number;
  updated: number;
  skipped: SkippedChart[];
  /** Imported anyway, with something worth a look (unknown key, title from the file name…). */
  notes: ChartFileWarning[];
}

export function summarizeChartImport(
  writes: ImportWrites,
  warnings: ChartFileWarning[],
  keptExisting: ImportMatch<ImportedChart>[],
): ChartImportSummary {
  const skipped: SkippedChart[] = [];
  const notes: ChartFileWarning[] = [];
  for (const warning of warnings) {
    const reason = SKIPPING_WARNINGS[warning.code];
    if (reason) skipped.push({ file: warning.file, title: warning.title, reason });
    else notes.push(warning);
  }
  for (const { imported } of keptExisting) {
    skipped.push({
      file: imported.file,
      title: imported.song.title,
      reason: CHART_SKIP_REASON.alreadyInCatalog,
    });
  }
  return { added: writes.added.length, updated: writes.updated.length, skipped, notes };
}
