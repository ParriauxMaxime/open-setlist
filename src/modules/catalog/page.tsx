import type { Song } from "@db";
import { useDb } from "@db/provider";
import { formatKey } from "@domain/chords/notation";
import { MUSICAL_KEY_LIST } from "@domain/music";
import { useActiveProfileId } from "@domain/profiles";
import {
  ACTIVE_STATUS_FILTER,
  matchesStatusFilter,
  parseSongStatus,
  resolveSongStatus,
  SONG_STATUS_FILTER_LIST,
  SONG_STATUS_LIST,
  songStatusLabelKey,
  songStatusRank,
} from "@domain/song-status";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { DataTable } from "../design-system/components/data-table";
import { SongStatusDot } from "../shared/components/song-status-dot";
import { useMyNotes } from "../shared/hooks/use-my-notes";
import { useNotation } from "../shared/hooks/use-notation";
import { ChartFileImport } from "./components/chart-file-import";

const col = createColumnHelper<Song>();

const initialFilters = [{ id: "status", value: ACTIVE_STATUS_FILTER }];

function uniqueTags(data: Song[]): string[] {
  const set = new Set<string>();
  for (const s of data) {
    for (const t of s.tags) set.add(t);
  }
  return [...set].sort();
}

function uniqueArtists(data: Song[]): string[] {
  const set = new Set<string>();
  for (const s of data) {
    if (s.artist) set.add(s.artist);
  }
  return [...set].sort();
}

export function CatalogPage() {
  const { t } = useTranslation();
  const db = useDb();
  const notation = useNotation();
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);
  const myNotes = useMyNotes(useActiveProfileId());
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const columns: ColumnDef<Song, unknown>[] = [
    col.accessor("title", {
      header: t("catalog.colTitle"),
      cell: (info) => {
        const song = info.row.original;
        return (
          <div>
            <span className="font-medium">{info.getValue()}</span>
            {myNotes[song.id] && (
              <span
                role="img"
                aria-label={t("myNotes.hasNote")}
                title={t("myNotes.hasNote")}
                className="ml-1.5 text-xs"
              >
                📝
              </span>
            )}
            <div className="mt-0.5 flex items-center gap-2 text-xs md:hidden">
              {song.artist && <span className="text-text-muted">{song.artist}</span>}
              {song.key && <span className="text-chord">{formatKey(song.key, notation)}</span>}
            </div>
          </div>
        );
      },
    }) as ColumnDef<Song, unknown>,
    col.accessor((song) => resolveSongStatus(song.status), {
      id: "status",
      header: t("songStatus.label"),
      size: 140,
      sortingFn: (a, b) => songStatusRank(a.original.status) - songStatusRank(b.original.status),
      filterFn: (row, _columnId, filterValue) =>
        matchesStatusFilter(row.original.status, filterValue as string | undefined),
      cell: (info) => <StatusCell song={info.row.original} />,
      meta: {
        filterType: "select",
        filterOptions: [...SONG_STATUS_FILTER_LIST],
        filterOptionLabel: (value) => {
          const status = parseSongStatus(value);
          return status ? t(songStatusLabelKey(status)) : t("songStatus.filterActive");
        },
        disableRowLink: true,
      },
    }) as ColumnDef<Song, unknown>,
    col.accessor("artist", {
      header: t("catalog.colArtist"),
      cell: (info) => <span className="text-text-muted">{info.getValue() ?? "—"}</span>,
      meta: {
        filterType: "select",
        filterOptions: uniqueArtists,
        hideFilterOnMobile: true,
        className: "hidden md:table-cell",
      },
    }) as ColumnDef<Song, unknown>,
    col.accessor("key", {
      header: t("catalog.colKey"),
      size: 80,
      cell: (info) => {
        const v = info.getValue();
        return v ? <span className="text-chord">{formatKey(v, notation)}</span> : null;
      },
      meta: {
        filterType: "select",
        filterOptions: [...MUSICAL_KEY_LIST],
        filterOptionLabel: (key) => formatKey(key, notation),
        hideFilterOnMobile: true,
        className: "hidden md:table-cell",
      },
    }) as ColumnDef<Song, unknown>,
    col.accessor("bpm", {
      header: t("catalog.colBpm"),
      size: 70,
      enableColumnFilter: false,
      cell: (info) => {
        const v = info.getValue();
        return v != null ? <span className="text-text-faint">{v}</span> : null;
      },
      meta: { className: "hidden md:table-cell" },
    }) as ColumnDef<Song, unknown>,
    col.accessor("tags", {
      header: t("catalog.colTags"),
      enableSorting: false,
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue) return true;
        return row.original.tags.includes(filterValue as string);
      },
      cell: (info) => {
        const tags = info.getValue();
        return tags.length > 0 ? (
          <span className="text-text-faint">{tags.slice(0, 3).join(", ")}</span>
        ) : null;
      },
      meta: {
        filterType: "select",
        filterOptions: uniqueTags,
        className: "hidden md:table-cell",
        hideFilterOnMobile: true,
      },
    }) as ColumnDef<Song, unknown>,
  ];

  return (
    <div className="p-page">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("catalog.title")}</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ChartFileImport
            onSuccess={(message) => setImportStatus({ ok: true, message })}
            onError={(message) => setImportStatus({ ok: false, message })}
          />
          <Link to={Router.SongNew()} className="btn btn-primary">
            {t("catalog.addSong")}
          </Link>
        </div>
      </div>

      {importStatus && (
        <output className={`mb-4 block text-sm ${importStatus.ok ? "text-accent" : "text-danger"}`}>
          {importStatus.message}
        </output>
      )}

      {songs === undefined ? (
        <p className="text-text-muted">{t("common.loading")}</p>
      ) : (
        <DataTable
          columns={columns}
          data={songs}
          getRowHref={(song) => Router.SongEdit({ songId: song.id })}
          globalSearchFields={["title", "artist", "tags"]}
          searchPlaceholder={t("catalog.searchPlaceholder")}
          emptyMessage={t("catalog.empty")}
          initialColumnFilters={initialFilters}
        />
      )}
    </div>
  );
}

/** Status dot + label; a transparent native select on top gives a quick status menu. */
function StatusCell({ song }: { song: Song }) {
  const { t } = useTranslation();
  const db = useDb();

  return (
    <span className="relative inline-flex min-h-6 min-w-6 items-center rounded-sm text-text-muted focus-within:outline-2 focus-within:outline-border-focus">
      <SongStatusDot status={song.status} withLabel labelHiddenOnMobile />
      <select
        value={resolveSongStatus(song.status)}
        onChange={(e) => {
          const status = parseSongStatus(e.target.value);
          if (status) db.songs.update(song.id, { status, updatedAt: Date.now() });
        }}
        aria-label={t("songStatus.change")}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {SONG_STATUS_LIST.map((status) => (
          <option key={status} value={status}>
            {t(songStatusLabelKey(status))}
          </option>
        ))}
      </select>
    </span>
  );
}
