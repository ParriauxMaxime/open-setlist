import type { Setlist, Song } from "@db";
import { useDb } from "@db/provider";
import { formatLongDuration } from "@domain/format";
import { createId } from "@domain/id";
import { setlistDuration } from "@domain/setlist-duration";
import { formatGigDate, isoDay, sortSetlistsForPlaying } from "@domain/setlist-order";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { DataTable } from "../design-system/components/data-table";
import { useStageHref } from "../shared/hooks/use-stage-href";
import { SetlistEditor } from "./components/setlist-editor";
import { useDuplicateSetlist } from "./hooks/use-duplicate-setlist";

interface SetlistPageProps {
  setlistId?: string;
}

export function SetlistPage({ setlistId }: SetlistPageProps) {
  if (setlistId) {
    return <SetlistEditor setlistId={setlistId} />;
  }
  return <SetlistListPage />;
}

const col = createColumnHelper<Setlist>();

function songIds(setlist: Setlist): string[] {
  return setlist.sets.flatMap((s) => s.songIds);
}

function SetlistListPage() {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const today = isoDay(new Date());
  const setlists = useLiveQuery(
    async () => sortSetlistsForPlaying(await db.setlists.toArray(), today),
    [db, today],
  );
  const songs = useLiveQuery(() => db.songs.toArray(), [db]);
  const duplicateSetlist = useDuplicateSetlist();
  const stageHref = useStageHref();
  const gigDate = (date: string | undefined) =>
    date ? formatGigDate(date, i18n.language, today) : undefined;

  /** "30 songs · 2 sets · 1h42", the sets only when more than one. */
  const contents = (setlist: Setlist, catalog: Song[]) => {
    const ids = songIds(setlist);
    const { total, unknownCount } = setlistDuration(ids, catalog);
    const summary = [
      t("setlist.songCount", { count: ids.length }),
      setlist.sets.length > 1 ? t("setlist.setCount", { count: setlist.sets.length }) : null,
      total > 0 ? formatLongDuration(total) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const hint = unknownCount > 0 ? t("setlist.unknownDuration", { count: unknownCount }) : "";
    return { summary, hint };
  };

  const columns: ColumnDef<Setlist, unknown>[] = [
    col.accessor("name", {
      header: t("setlist.colName"),
      cell: (info) => {
        const setlist = info.row.original;
        const { summary, hint } = contents(setlist, songs ?? []);
        const details = [gigDate(setlist.date), setlist.venue, summary].filter(Boolean);
        return (
          <div>
            <span className="font-medium">{info.getValue()}</span>
            <div className="mt-0.5 text-xs text-text-muted md:hidden">{details.join(" · ")}</div>
            {/* Tablets have the date and venue columns but not the songs one */}
            <div
              className="mt-0.5 hidden text-xs text-text-faint md:block lg:hidden"
              title={hint || undefined}
            >
              {summary}
            </div>
          </div>
        );
      },
    }) as ColumnDef<Setlist, unknown>,
    col.accessor("date", {
      header: t("setlist.colDate"),
      size: 150,
      sortDescFirst: true,
      cell: (info) => <span className="text-text-muted">{gigDate(info.getValue()) ?? "—"}</span>,
      meta: { className: "hidden md:table-cell" },
    }) as ColumnDef<Setlist, unknown>,
    col.accessor("venue", {
      header: t("setlist.colVenue"),
      cell: (info) => <span className="text-text-muted">{info.getValue() ?? "—"}</span>,
      meta: { className: "hidden md:table-cell" },
    }) as ColumnDef<Setlist, unknown>,
    col.accessor("sets", {
      header: t("setlist.colSongs"),
      enableSorting: false,
      cell: (info) => {
        const { summary, hint } = contents(info.row.original, songs ?? []);
        return (
          <span className="whitespace-nowrap text-text-faint" title={hint || undefined}>
            {summary}
          </span>
        );
      },
      meta: { className: "hidden lg:table-cell" },
    }) as ColumnDef<Setlist, unknown>,
    col.display({
      id: "actions",
      size: 160,
      cell: (info) => {
        const setlist = info.row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => duplicateSetlist(setlist)}
              aria-label={t("setlist.duplicateNamed", { name: setlist.name })}
              title={t("setlist.duplicateNamed", { name: setlist.name })}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-lg text-text-muted hover:bg-bg-hover hover:text-text"
            >
              ⧉
            </button>
            {songIds(setlist).length > 0 && (
              <Link to={stageHref(setlist.id)} className="btn btn-primary whitespace-nowrap">
                ▶ {t("setlist.perform")}
              </Link>
            )}
          </div>
        );
      },
      meta: { disableRowLink: true, className: "text-right" },
    }) as ColumnDef<Setlist, unknown>,
  ];

  const createSetlist = async () => {
    const id = createId();
    const now = Date.now();
    await db.setlists.put({
      id,
      name: t("setlist.defaultName"),
      sets: [{ name: t("setlist.defaultSetName"), songIds: [] }],
      createdAt: now,
      updatedAt: now,
    });
    Router.push("SetlistEdit", { setlistId: id });
  };

  return (
    <div className="p-page">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("setlist.title")}</h1>
        <button type="button" onClick={createSetlist} className="btn btn-primary">
          {t("setlist.newSetlist")}
        </button>
      </div>

      {setlists === undefined ? (
        <p className="text-text-muted">{t("common.loading")}</p>
      ) : (
        <DataTable
          columns={columns}
          data={setlists}
          getRowHref={(sl) => Router.SetlistEdit({ setlistId: sl.id })}
          emptyMessage={t("setlist.empty")}
          emptyAction={
            <button type="button" onClick={createSetlist} className="btn btn-outline btn-sm">
              {t("setlist.newSetlist")}
            </button>
          }
        />
      )}
    </div>
  );
}
