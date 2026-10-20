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
import { groupSpellings, sameText } from "@domain/text";
import { markWhatsNewSeen, useWelcome, WELCOME } from "@domain/welcome";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { Badge } from "../design-system/components/card";
import { DataTable } from "../design-system/components/data-table";
import { SongStatusDot } from "../shared/components/song-status-dot";
import { WhatsNewCard } from "../shared/components/whats-new-card";
import { useMyNotes } from "../shared/hooks/use-my-notes";
import { useNotation } from "../shared/hooks/use-notation";
import { BulkEditBar } from "./components/bulk-edit-bar";
import { ChartFileImport } from "./components/chart-file-import";
import { useSongUpdates } from "./hooks/use-song-updates";

const col = createColumnHelper<Song>();

const initialFilters = [{ id: "status", value: ACTIVE_STATUS_FILTER }];

function uniqueTags(data: Song[]): string[] {
  return groupSpellings(data.flatMap((s) => s.tags));
}

function uniqueArtists(data: Song[]): string[] {
  return groupSpellings(data.flatMap((s) => (s.artist ? [s.artist] : [])));
}

/** Keys used in the catalog, in the order of the key list. */
function usedKeys(data: Song[]): string[] {
  const used = new Set(data.flatMap((s) => (s.key ? [s.key] : [])));
  const known = MUSICAL_KEY_LIST.filter((key) => used.has(key));
  const others = [...used].filter((key) => !MUSICAL_KEY_LIST.includes(key)).sort();
  return [...known, ...others];
}

export function CatalogPage() {
  const { t } = useTranslation();
  const db = useDb();
  const notation = useNotation();
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);
  const myNotes = useMyNotes(useActiveProfileId());
  const [importStatus, setImportStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const welcome = useWelcome();
  const { setStatus, addTag } = useSongUpdates();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const toggleSelected = (ids: readonly string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const applyToSelected = async (update: (ids: readonly string[]) => Promise<void>) => {
    await update([...selected]);
    setSelected(new Set());
  };

  const selectColumn = col.display({
    id: "select",
    size: 44,
    header: ({ table }) => {
      const ids = table.getRowModel().rows.map((row) => row.original.id);
      return (
        <input
          type="checkbox"
          checked={ids.length > 0 && ids.every((id) => selected.has(id))}
          onChange={(e) => toggleSelected(ids, e.target.checked)}
          aria-label={t("catalog.selectAllShown")}
          className="h-4 w-4 rounded accent-[var(--color-accent)]"
        />
      );
    },
    cell: (info) => {
      const song = info.row.original;
      return (
        <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={selected.has(song.id)}
            onChange={(e) => toggleSelected([song.id], e.target.checked)}
            aria-label={t("catalog.selectSong", { title: song.title })}
            className="h-4 w-4 rounded accent-[var(--color-accent)]"
          />
        </label>
      );
    },
    meta: { disableRowLink: true, className: "!px-1 !py-0" },
  }) as ColumnDef<Song, unknown>;

  const columns: ColumnDef<Song, unknown>[] = [
    ...(selecting ? [selectColumn] : []),
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
            {song.attachments && song.attachments.length > 0 && (
              <span
                role="img"
                aria-label={t("attachments.hasSheet")}
                title={t("attachments.hasSheet")}
                className="ml-1.5 text-xs"
              >
                📄
              </span>
            )}
            <div className="mt-0.5 flex items-center gap-2 text-xs md:hidden">
              {song.artist && <span className="text-text-muted">{song.artist}</span>}
              {song.key && <span className="text-chord">{formatKey(song.key, notation)}</span>}
            </div>
          </div>
        );
      },
      // Titles keep one line on wider screens instead of giving their room to the filters
      meta: { className: "md:min-w-56" },
    }) as ColumnDef<Song, unknown>,
    col.accessor((song) => resolveSongStatus(song.status), {
      id: "status",
      header: t("songStatus.label"),
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
      filterFn: (row, _columnId, filterValue) =>
        !filterValue || sameText(row.original.artist ?? "", filterValue as string),
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
        return v ? (
          <span className="text-chord">{formatKey(v, notation)}</span>
        ) : (
          <span className="text-text-faint">—</span>
        );
      },
      filterFn: (row, _columnId, filterValue) => !filterValue || row.original.key === filterValue,
      meta: {
        filterType: "select",
        filterOptions: usedKeys,
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
        return <span className="text-text-faint">{v ?? "—"}</span>;
      },
      meta: { className: "hidden md:table-cell" },
    }) as ColumnDef<Song, unknown>,
    col.accessor("tags", {
      header: t("catalog.colTags"),
      enableSorting: false,
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue) return true;
        return row.original.tags.some((tag) => sameText(tag, filterValue as string));
      },
      cell: (info) => {
        const tags = info.getValue();
        return tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} tone="muted">
                {tag}
              </Badge>
            ))}
          </span>
        ) : null;
      },
      meta: {
        filterType: "select",
        filterOptions: uniqueTags,
        className: "hidden lg:table-cell",
        hideFilterOnMobile: true,
      },
    }) as ColumnDef<Song, unknown>,
    col.display({
      id: "edit",
      size: 56,
      cell: (info) => (
        <Link
          to={Router.SongEdit({ songId: info.row.original.id })}
          aria-label={t("catalog.editSong", { title: info.row.original.title })}
          title={t("catalog.editSong", { title: info.row.original.title })}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-lg text-text-muted hover:bg-bg-hover hover:text-text"
        >
          ✎
        </Link>
      ),
      meta: { disableRowLink: true, className: "!px-1 !py-0 text-right" },
    }) as ColumnDef<Song, unknown>,
  ];

  return (
    <div className="p-page">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("catalog.title")}</h1>
          {songs && (
            <p className="text-sm text-text-muted">
              {t("sync.songCount", { count: songs.length })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {songs && songs.length > 0 && !selecting && (
            <button type="button" onClick={() => setSelecting(true)} className="btn btn-ghost">
              {t("catalog.select")}
            </button>
          )}
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

      {welcome === WELCOME.whatsNew && (
        <WhatsNewCard onDismiss={markWhatsNewSeen} className="mb-4" />
      )}

      {selecting && (
        <BulkEditBar
          count={selected.size}
          tags={uniqueTags(songs ?? [])}
          onSetStatus={(status) => applyToSelected((ids) => setStatus(ids, status))}
          onAddTag={(tag) => applyToSelected((ids) => addTag(ids, tag))}
          onCancel={stopSelecting}
        />
      )}

      {songs === undefined ? (
        <p className="text-text-muted">{t("common.loading")}</p>
      ) : (
        <DataTable
          columns={columns}
          data={songs}
          getRowHref={selecting ? undefined : (song) => Router.PerformSong({ songId: song.id })}
          globalSearchFields={["title", "artist", "tags"]}
          searchPlaceholder={t("catalog.searchPlaceholder")}
          emptyMessage={t("catalog.empty")}
          emptyAction={
            <Link to={Router.SongNew()} className="btn btn-outline btn-sm">
              {t("catalog.addSong")}
            </Link>
          }
          initialColumnFilters={initialFilters}
        />
      )}
    </div>
  );
}

/** Status dot, its name as tooltip; a transparent native select on top gives a quick status menu. */
function StatusCell({ song }: { song: Song }) {
  const { t } = useTranslation();
  const { setStatus } = useSongUpdates();

  return (
    <span className="relative inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm focus-within:outline-2 focus-within:outline-border-focus">
      <SongStatusDot status={song.status} />
      <select
        value={resolveSongStatus(song.status)}
        onChange={(e) => {
          const status = parseSongStatus(e.target.value);
          if (status) setStatus([song.id], status);
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
