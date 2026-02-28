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
    className?: string;
    hideFilterOnMobile?: boolean;
  }
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowHref?: (row: T) => string;
  emptyMessage?: string;
  globalSearchFields?: (keyof T & string)[];
  searchPlaceholder?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowHref,
  emptyMessage,
  globalSearchFields,
  searchPlaceholder,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

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
  const hasActiveFilters = globalFilter || columnFilters.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Global search */}
      {globalSearchFields && (
        <input
          type="search"
          placeholder={searchPlaceholder ?? t("common.search")}
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          aria-label={searchPlaceholder ?? t("common.search")}
          className="field"
        />
      )}

      {data.length === 0 && !hasActiveFilters ? (
        <p className="text-text-muted">{emptyMessage ?? t("common.noData")}</p>
      ) : rowCount === 0 ? (
        <p className="text-text-muted">{t("common.noResults")}</p>
      ) : (
        <table className="w-full text-base md:text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border text-left">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={[
                      "px-3 py-2 font-medium text-text-muted",
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
                    {header.isPlaceholder ? null : (
                      <div className="flex flex-col gap-1">
                        {header.column.getCanSort() ? (
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
                        {header.column.getCanFilter() && (
                          <div
                            className={
                              header.column.columnDef.meta?.hideFilterOnMobile
                                ? "hidden md:block"
                                : undefined
                            }
                          >
                            <ColumnFilter column={header.column} data={data} />
                          </div>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const href = getRowHref?.(row.original);
              return (
                <tr
                  key={row.id}
                  className={[
                    "border-b border-border/50 transition-colors hover:bg-bg-hover",
                    href ? "cursor-pointer" : "",
                  ].join(" ")}
                >
                  {row.getVisibleCells().map((cell, ci) => (
                    <td
                      key={cell.id}
                      className={[
                        href ? "!p-0" : "px-3 py-3.5 md:py-2.5",
                        cell.column.columnDef.meta?.className,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {href ? (
                        <Link
                          to={href}
                          className="block px-3 py-3.5 md:py-2.5"
                          tabIndex={ci === 0 ? 0 : -1}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </Link>
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ColumnFilter<T>({ column, data }: { column: Column<T, unknown>; data: T[] }) {
  const { t } = useTranslation();
  const meta = column.columnDef.meta;
  const filterType = meta?.filterType;

  if (!filterType) return null;

  if (filterType === "select") {
    return <SelectFilter column={column} data={data} />;
  }

  // Text filter
  const value = (column.getFilterValue() as string) ?? "";
  const columnName = typeof column.columnDef.header === "string" ? column.columnDef.header : "";
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      placeholder={t("common.filter")}
      aria-label={columnName ? `Filter ${columnName}` : t("common.filter")}
      className="field-sm"
    />
  );
}

function SelectFilter<T>({ column, data }: { column: Column<T, unknown>; data: T[] }) {
  const { t } = useTranslation();
  const meta = column.columnDef.meta;
  const value = (column.getFilterValue() as string) ?? "";
  const columnName = typeof column.columnDef.header === "string" ? column.columnDef.header : "";

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
      aria-label={columnName ? `Filter ${columnName}` : t("common.filter")}
      className="field-sm"
    >
      <option value="">{t("common.all")}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function SortIndicator({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) return <span className="text-text-faint">↕</span>;
  return <span>{direction === "asc" ? "↑" : "↓"}</span>;
}
