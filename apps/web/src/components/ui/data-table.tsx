"use client";

/* eslint-disable react/incompatible-library */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type ColumnFilter,
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  flexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { exportToCsv, type CsvColumn } from "@/lib/csv-export.ts";

export const dashboardTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns,
  sortFns,
});

export interface DataTableFilterOption {
  value: string;
  label: string;
}

export interface DataTableProps<TData extends object> {
  columns: ColumnDef<typeof dashboardTableFeatures, TData, unknown>[];
  data: TData[];
  searchPlaceholder?: string;
  searchLabel?: string;
  searchColumn?: string;
  exportFilename?: string;
  exportColumns?: Array<CsvColumn<TData>>;
  filterColumn?: string;
  filterOptions?: DataTableFilterOption[];
  filterPlaceholder?: string;
  filterLabel?: string;
  /** Accessible name for the rendered table. */
  tableLabel?: string;
  /**
   * Hide the search/filter/export toolbar. For embedded tables where the
   * parent page already scopes the data (e.g. "recent N" previews).
   */
  hideToolbar?: boolean;
  /**
   * Makes the whole row navigate to the returned href. The primary cell must
   * still render a real link — that is the accessible affordance; this is a
   * pointer convenience on top of it.
   */
  rowHref?: (row: TData) => string;
}

/** Interactivity that owns its own navigation; a row click must not steal it. */
const INTERACTIVE_TARGET = "a, button, input, select, textarea";

/** Modified clicks belong to the browser (new tab, new window) or to the link in the primary cell. */
function isModifiedClick(event: React.MouseEvent): boolean {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/**
 * Decides whether a click on a row should navigate. A drag-select ends with a
 * click on the common ancestor, so navigating would destroy the selection the
 * user just made.
 */
function shouldNavigateFromRowClick(event: React.MouseEvent, href: string): boolean {
  if (!href) return false;

  if (!window.getSelection()?.isCollapsed) return false;

  if (isModifiedClick(event)) return false;

  return !(event.target instanceof Element && event.target.closest(INTERACTIVE_TARGET));
}

function ariaSortFor(state: false | "asc" | "desc"): "ascending" | "descending" | "none" {
  if (state === "asc") return "ascending";
  if (state === "desc") return "descending";

  return "none";
}

function SortIndicator({ state }: { state: false | "asc" | "desc" }) {
  if (state === "asc") return <ArrowUp className="size-3.5" aria-hidden="true" />;
  if (state === "desc") return <ArrowDown className="size-3.5" aria-hidden="true" />;

  return <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />;
}

export function DataTable<TData extends object>({
  columns,
  data,
  searchPlaceholder = "Filtrar resultados…",
  searchLabel = "Buscar na tabela",
  searchColumn,
  exportFilename = "export",
  exportColumns,
  filterColumn,
  filterOptions,
  filterPlaceholder = "Filtrar…",
  filterLabel = "Filtrar",
  hideToolbar = false,
  tableLabel,
  rowHref,
}: DataTableProps<TData>) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [columnFilters, setColumnFilters] = React.useState<ColumnFilter[]>([]);

  const table = useTable({
    features: dashboardTableFeatures,
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 8,
      },
    },
  });

  const handleExport = () => {
    if (!exportColumns) return;

    // Export all filtered AND sorted rows, not just the active page
    const sortedAndFilteredRows = table.getSortedRowModel().rows.map((r) => r.original);

    exportToCsv(exportColumns, sortedAndFilteredRows, exportFilename);
  };

  const currentFilterValue = searchColumn
    ? String(table.getColumn(searchColumn)?.getFilterValue() ?? "")
    : globalFilter;

  const searchInputId = React.useId();

  const filterColumnApi = filterColumn ? table.getColumn(filterColumn) : undefined;
  const showFilter = filterColumnApi && filterOptions && filterOptions.length > 0;
  const filterValue = String(filterColumnApi?.getFilterValue() ?? "");

  const selectedFilterOption =
    filterOptions?.find((option) => option.value === filterValue) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {hideToolbar ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <label htmlFor={searchInputId} className="sr-only">
              {searchLabel}
            </label>
            <Input
              id={searchInputId}
              placeholder={searchPlaceholder}
              value={currentFilterValue}
              onChange={(e) => {
                if (searchColumn) {
                  table.getColumn(searchColumn)?.setFilterValue(e.target.value);
                } else {
                  setGlobalFilter(e.target.value);
                }
              }}
              className="max-w-sm"
            />
            {showFilter && filterOptions ? (
              <Combobox
                items={filterOptions}
                itemToStringValue={(option) => option.label}
                value={selectedFilterOption}
                onValueChange={(selected) => {
                  filterColumnApi?.setFilterValue(selected?.value ?? "");
                }}
              >
                <ComboboxInput placeholder={filterPlaceholder} aria-label={filterLabel} showClear />
                <ComboboxContent>
                  <ComboboxEmpty>Nenhuma opção encontrada.</ComboboxEmpty>
                  <ComboboxList>
                    {(option) => (
                      <ComboboxItem key={option.value} value={option}>
                        {option.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            ) : null}
          </div>
          {exportColumns && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              Exportar CSV
            </Button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border shadow-surface">
        <Table aria-label={tableLabel}>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();
                  const definition = header.column.columnDef.header;
                  const sortLabel = typeof definition === "string" ? definition : header.column.id;

                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={canSort ? ariaSortFor(isSorted) : undefined}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          aria-label={`Ordenar por ${sortLabel}`}
                          className="flex items-center gap-1 font-medium hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIndicator state={isSorted} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const href = rowHref?.(row.original);

                return (
                  <TableRow
                    key={row.id}
                    className={href ? "cursor-pointer hover:bg-muted" : undefined}
                    onClick={
                      href
                        ? (event) => {
                            if (shouldNavigateFromRowClick(event, href)) {
                              router.push(href);
                            }
                          }
                        : undefined
                    }
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
          <div>
            Página {table.state.pagination.pageIndex + 1} de {table.getPageCount()} (
            {table.getFilteredRowModel().rows.length} itens)
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Próxima
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
