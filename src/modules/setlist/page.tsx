import type { Setlist } from "@db";
import { useDb } from "@db/provider";
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

function SetlistListPage() {
  const { t } = useTranslation();
  const db = useDb();
  const setlists = useLiveQuery(() => db.setlists.orderBy("updatedAt").reverse().toArray(), [db]);

  const columns: ColumnDef<Setlist, unknown>[] = [
    col.accessor("name", {
      header: t("setlist.colName"),
      cell: (info) => <span className="font-medium">{info.getValue()}</span>,
    }) as ColumnDef<Setlist, unknown>,
    col.accessor("venue", {
      header: t("setlist.colVenue"),
      cell: (info) => <span className="text-text-muted">{info.getValue() ?? "—"}</span>,
    }) as ColumnDef<Setlist, unknown>,
    col.accessor("date", {
      header: t("setlist.colDate"),
      size: 110,
      cell: (info) => <span className="text-text-faint">{info.getValue() ?? "—"}</span>,
    }) as ColumnDef<Setlist, unknown>,
    col.accessor("sets", {
      header: t("setlist.colSongs"),
      size: 70,
      enableSorting: false,
      cell: (info) => {
        const count = info.getValue().reduce((n, s) => n + s.songIds.length, 0);
        return <span className="text-text-faint">{count}</span>;
      },
    }) as ColumnDef<Setlist, unknown>,
  ];

  const createSetlist = async () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    await db.setlists.put({
      id,
      name: "New Setlist",
      sets: [{ name: "Set 1", songIds: [] }],
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
