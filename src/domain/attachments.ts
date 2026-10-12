/**
 * Song attachments: sheet music as PDF or image, optionally tied to one part
 * ("Trompette.pdf" for the trumpet). The song carries the metadata (synced);
 * the bytes live in the `files` table of the device.
 */

import type { Song, SongAttachment } from "@db/song";
import { hasChart } from "./chordpro/has-chart";
import { parse } from "./chordpro/parser";
import { ALL_PARTS, isKnownPart, normalizePart } from "./parts";

export const ATTACHMENT_KIND = {
  pdf: "pdf",
  image: "image",
} as const;

export type AttachmentKind = (typeof ATTACHMENT_KIND)[keyof typeof ATTACHMENT_KIND];

export const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,.pdf";

/** Above this, tablets struggle and sync gets slow: the editor warns. */
export const ATTACHMENT_LARGE_BYTES = 15 * 1024 * 1024;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Kind from the MIME type, or the extension when the browser gives none. */
export function attachmentKind(file: { name: string; type: string }): AttachmentKind | undefined {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return ATTACHMENT_KIND.pdf;
  if (IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/.test(name)) {
    return ATTACHMENT_KIND.image;
  }
  return undefined;
}

/** `"03 - Take Five (Trompette).pdf"` → `"Take Five (Trompette)"`. */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/_/g, " ")
    .replace(/^\d+\s*[-.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Part named in the file name (`"Take Five - Trompette.pdf"` → `"trumpet"`), if any. */
export function partFromFileName(name: string): string | undefined {
  const words = titleFromFileName(name).split(/[^\p{L}\p{N}]+/u);
  for (let i = words.length - 1; i >= 0; i--) {
    // Two-word parts first: "sax alto" before "alto"
    const candidates = i > 0 ? [`${words[i - 1]}-${words[i]}`, words[i]] : [words[i]];
    const part = candidates.map(normalizePart).find(isKnownPart);
    if (part) return part;
  }
  return undefined;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// What the stage shows
// ---------------------------------------------------------------------------

/** Stage view of a song: its ChordPro chart, or one of its attachments (by id). */
export const CHART_VIEW = "chart";

/**
 * View shown for a song. The musician's own choice wins; else the sheet for their part;
 * else the chart, or the first sheet when there is no chart.
 */
export function resolveStageView(
  song: Pick<Song, "content" | "attachments">,
  instrument: string,
  chosen?: string,
): string {
  const attachments = song.attachments ?? [];
  if (attachments.length === 0) return CHART_VIEW;
  if (chosen !== undefined && (chosen === CHART_VIEW || attachments.some((a) => a.id === chosen))) {
    return chosen;
  }

  const mine =
    instrument !== ALL_PARTS &&
    attachments.find((a) => a.part && normalizePart(a.part) === normalizePart(instrument));
  if (mine) return mine.id;
  if (hasChart(parse(song.content))) return CHART_VIEW;
  return (attachments.find((a) => !a.part) ?? attachments[0]).id;
}

export function stageAttachment(
  song: Pick<Song, "content" | "attachments">,
  instrument: string,
  chosen?: string,
): SongAttachment | undefined {
  const view = resolveStageView(song, instrument, chosen);
  return song.attachments?.find((a) => a.id === view);
}

// ---------------------------------------------------------------------------
// The musician's choice per song (this device only)
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = "open-setlist-stage-views";

/** Song id → chosen view. */
export type StageViews = Record<string, string>;

export function loadStageViews(profileId: string): StageViews {
  try {
    const raw = JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}-${profileId}`) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function saveStageView(profileId: string, songId: string, view: string): StageViews {
  const views = { ...loadStageViews(profileId), [songId]: view };
  localStorage.setItem(`${STORAGE_KEY_PREFIX}-${profileId}`, JSON.stringify(views));
  return views;
}
