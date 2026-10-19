import { fuzzyMatchAny } from "@domain/search";
import { Link } from "@swan-io/chicane";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// Extend column meta to describe filter UI
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    filterType?: "text" | "select";
    filterOptions?: string[] | ((data: TData[]) => string[]);
    filterOptionLabel?: (value: string) => string;
    className?: string;
    hideFilterOnMobile?: boolean;
    /** Render the cell outside the row link (for cells with their own controls). */
    disableRowLink?: boolean;
  }
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowHref?: (row: T) => string;
  emptyMessage?: string;
  globalSearchFields?: (keyof T & string)[];
  searchPlaceholder?: string;
  initialColumnFilters?: ColumnFiltersState;
}

/** A searchable, sortable table in a card: the filters sit in a toolbar above it. */
export function DataTable<T>({
  columns,
  data,
  getRowHref,
  emptyMessage,
  globalSearchFields,
  searchPlaceholder,
  initialColumnFilters,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialColumnFilters ?? [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: (row, _columnId, filterValue) => {
      if (!globalSearchFields || !filterValue) return true;
      const values = globalSearchFields.flatMap((f) => {
        const v = row.getValue(f as string);
        if (Array.isArray(v)) return v as string[];
        return [v as string | undefined];
      });
      return fuzzyMatchAny(values, filterValue as string);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rowCount = table.getRowModel().rows.length;
  const filterColumns = table.getAllLeafColumns().filter((c) => c.columnDef.meta?.filterType);
  const initial = initialColumnFilters ?? [];
  const filtering =
    globalFilter !== "" || JSON.stringify(columnFilters) !== JSON.stringify(initial);
  const resetFilters = () => {
    setGlobalFilter("");
    setColumnFilters(initial);
  };
  const showEverything = () => {
    setGlobalFilter("");
    setColumnFilters([]);
  };

  if (data.length === 0) {
    return <p className="text-text-muted">{emptyMessage ?? t("common.noData")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {(globalSearchFields || filterColumns.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {globalSearchFields && (
            <input
              type="search"
              placeholder={searchPlaceholder ?? t("common.search")}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              aria-label={searchPlaceholder ?? t("common.search")}
              className="field min-w-48 flex-1"
            />
          )}
          {filterColumns.map((column) => (
            <div
              key={column.id}
              className={column.columnDef.meta?.hideFilterOnMobile ? "hidden md:block" : undefined}
            >
              <ColumnFilter column={column} data={data} />
            </div>
          ))}
          {filtering && (
            <button type="button" onClick={resetFilters} className="btn btn-ghost btn-sm">
              {t("common.clearFilters")}
            </button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-bg-surface">
        <table className="w-full text-base md:text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-bg-hover/40 text-left">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={[
                      "px-3 py-2 text-xs font-medium text-text-muted",
                      header.column.columnDef.meta?.className,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    aria-sort={
                      header.column.getCanSort()
                        ? header.column.getIsSorted() === "asc"
                          ? "ascending"
                          : header.column.getIsSorted() === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={[
                          "inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-text",
                          header.column.getIsSorted() ? "text-accent" : "",
                        ].join(" ")}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIndicator direction={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border/60">
            {rowCount === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-text-muted">
                  <span className="mr-3">{t("common.noResults")}</span>
                  <button type="button" onClick={showEverything} className="btn btn-outline btn-sm">
                    {t("common.clearFilters")}
                  </button>
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((row) => {
              const href = getRowHref?.(row.original);
              return (
                <tr
                  key={row.id}
                  className={[
                    "transition-colors hover:bg-bg-hover",
                    href ? "cursor-pointer" : "",
                  ].join(" ")}
                >
                  {row.getVisibleCells().map((cell, ci) => {
                    const cellHref = cell.column.columnDef.meta?.disableRowLink ? undefined : href;
                    return (
                      <td
                        key={cell.id}
                        className={[
                          cellHref ? "!p-0" : "px-3 py-3.5 md:py-2.5",
                          cell.column.columnDef.meta?.className,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {cellHref ? (
                          <Link
                            to={cellHref}
                            className="block px-3 py-3.5 md:py-2.5"
                            tabIndex={ci === 0 ? 0 : -1}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </Link>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function columnName<T>(column: Column<T, unknown>): string {
  return typeof column.columnDef.header === "string" ? column.columnDef.header : "";
}

function ColumnFilter<T>({ column, data }: { column: Column<T, unknown>; data: T[] }) {
  const { t } = useTranslation();
  const meta = column.columnDef.meta;
  const filterType = meta?.filterType;

  if (!filterType) return null;

  if (filterType === "select") {
    return <SelectFilter column={column} data={data} />;
  }

  const value = (column.getFilterValue() as string) ?? "";
  const name = columnName(column);
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder={name || t("common.filter")}
      aria-label={name ? `Filter ${name}` : t("common.filter")}
      className="field-sm"
    />
  );
}

/** The unfiltered option reads as the column name, so the toolbar reads "Status, Artist, Key". */
function SelectFilter<T>({ column, data }: { column: Column<T, unknown>; data: T[] }) {
  const { t } = useTranslation();
  const meta = column.columnDef.meta;
  const value = (column.getFilterValue() as string) ?? "";
  const name = columnName(column);

  const options = useMemo(() => {
    if (!meta?.filterOptions) return [];
    if (typeof meta.filterOptions === "function") {
      return meta.filterOptions(data);
    }
    return meta.filterOptions;
  }, [meta, data]);

  return (
    <select
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      aria-label={name ? `Filter ${name}` : t("common.filter")}
      className={[
        "field-sm max-w-48 cursor-pointer truncate rounded-full !px-3 !py-1.5 !text-sm",
        value ? "!border-accent !text-accent" : "",
      ].join(" ")}
    >
      <option value="">{name ? `${name}: ${t("common.all")}` : t("common.all")}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {meta?.filterOptionLabel?.(opt) ?? opt}
        </option>
      ))}
    </select>
  );
}

function SortIndicator({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) return <span className="text-text-faint">↕</span>;
  return <span>{direction === "asc" ? "↑" : "↓"}</span>;
}
