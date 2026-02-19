import type { Song } from "@db";
import { useDb } from "@db/provider";
import { MUSICAL_KEY_LIST } from "@domain/music";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { DataTable } from "../design-system/components/data-table";

const col = createColumnHelper<Song>();

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
  const songs = useLiveQuery(() => db.songs.orderBy("title").toArray(), [db]);

  const columns: ColumnDef<Song, unknown>[] = [
    col.accessor("title", {
      header: t("catalog.colTitle"),
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }) as ColumnDef<Song, unknown>,
    col.accessor("artist", {
      header: t("catalog.colArtist"),
      cell: (info) => <span className="text-text-muted">{info.getValue() ?? "—"}</span>,
      meta: { filterType: "select", filterOptions: uniqueArtists, hideFilterOnMobile: true },
    }) as ColumnDef<Song, unknown>,
    col.accessor("key", {
      header: t("catalog.colKey"),
      size: 80,
      cell: (info) => {
        const v = info.getValue();
        return v ? <span className="text-chord">{v}</span> : null;
      },
      meta: {
        filterType: "select",
        filterOptions: [...MUSICAL_KEY_LIST],
        hideFilterOnMobile: true,
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
        <Link to={Router.SongNew()} className="btn btn-primary">
          {t("catalog.addSong")}
        </Link>
      </div>

      {songs === undefined ? (
        <p className="text-text-muted">{t("common.loading")}</p>
      ) : (
        <DataTable
          columns={columns}
          data={songs}
          getRowHref={(song) => Router.SongEdit({ songId: song.id })}
          globalSearchFields={["title", "artist"]}
          searchPlaceholder={t("catalog.searchPlaceholder")}
          emptyMessage={t("catalog.empty")}
        />
      )}
    </div>
  );
}
