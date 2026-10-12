import type { Setlist } from "@db";
import { useDb } from "@db/provider";
import { createId } from "@domain/id";
import { formatGigDate, isoDay, sortSetlistsForPlaying } from "@domain/setlist-order";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { DataTable } from "../design-system/components/data-table";
import { SetlistEditor } from "./components/setlist-editor";

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

function songCount(setlist: Setlist): number {
  return setlist.sets.reduce((n, s) => n + s.songIds.length, 0);
}

function SetlistListPage() {
  const { t, i18n } = useTranslation();
  const db = useDb();
  const today = isoDay(new Date());
  const setlists = useLiveQuery(
    async () => sortSetlistsForPlaying(await db.setlists.toArray(), today),
    [db, today],
  );
  const gigDate = (date: string | undefined) =>
    date ? formatGigDate(date, i18n.language, today) : undefined;

  const columns: ColumnDef<Setlist, unknown>[] = [
    col.accessor("name", {
      header: t("setlist.colName"),
      cell: (info) => {
        const setlist = info.row.original;
        const details = [
          gigDate(setlist.date),
          setlist.venue,
          t("setlist.songCount", { count: songCount(setlist) }),
        ].filter(Boolean);
        return (
          <div>
            <span className="font-medium">{info.getValue()}</span>
            <div className="mt-0.5 text-xs text-text-muted md:hidden">{details.join(" · ")}</div>
          </div>
        );
      },
    }) as ColumnDef<Setlist, unknown>,
    col.accessor("date", {
      header: t("setlist.colDate"),
      size: 150,
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
      size: 90,
      enableSorting: false,
      cell: (info) => <span className="text-text-faint">{songCount(info.row.original)}</span>,
      meta: { className: "hidden md:table-cell" },
    }) as ColumnDef<Setlist, unknown>,
    col.display({
      id: "play",
      size: 110,
      cell: (info) =>
        songCount(info.row.original) > 0 && (
          <Link
            to={Router.Perform({ setlistId: info.row.original.id })}
            className="btn btn-primary whitespace-nowrap"
          >
            ▶ {t("setlist.perform")}
          </Link>
        ),
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
        />
      )}
    </div>
  );
}
