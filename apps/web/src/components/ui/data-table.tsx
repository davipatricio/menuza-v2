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
  type ReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, SearchX } from "lucide-react";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
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

/** Modifier keys mean the click belongs to the browser (new tab, new window). */
const MODIFIER_KEYS = ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const;

function isModifiedClick(event: React.MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return true;

  return MODIFIER_KEYS.some((key) => event[key]);
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

type DashboardTable<TData extends object> = ReactTable<typeof dashboardTableFeatures, TData>;

function DataTableSearch<TData extends object>({
  table,
  searchColumn,
  globalFilter,
  onGlobalFilterChange,
  id,
  label,
  placeholder,
}: {
  table: DashboardTable<TData>;
  searchColumn?: string;
  globalFilter: string;
  onGlobalFilterChange: (value: string) => void;
  id: string;
  label: string;
  placeholder: string;
}) {
  const value = searchColumn
    ? String(table.getColumn(searchColumn)?.getFilterValue() ?? "")
    : globalFilter;

  const handleChange = (next: string) => {
    if (searchColumn) {
      table.getColumn(searchColumn)?.setFilterValue(next);
    } else {
      onGlobalFilterChange(next);
    }
  };

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="max-w-sm"
      />
    </>
  );
}

function DataTableFilter<TData extends object>({
  table,
  filterColumn,
  filterOptions,
  placeholder,
  label,
}: {
  table: DashboardTable<TData>;
  filterColumn?: string;
  filterOptions?: DataTableFilterOption[];
  placeholder: string;
  label: string;
}) {
  const api = filterColumn ? table.getColumn(filterColumn) : undefined;

  if (!api || !filterOptions || filterOptions.length === 0) return null;

  const value = String(api.getFilterValue() ?? "");
  const selected = filterOptions.find((option) => option.value === value) ?? null;

  return (
    <Combobox
      items={filterOptions}
      itemToStringValue={(option) => option.label}
      value={selected}
      onValueChange={(option) => api.setFilterValue(option?.value ?? "")}
    >
      <ComboboxInput placeholder={placeholder} aria-label={label} showClear />
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
  );
}

function DataTableExportButton({ visible, onExport }: { visible: boolean; onExport: () => void }) {
  if (!visible) return null;

  return (
    <Button variant="outline" size="sm" onClick={onExport}>
      Exportar CSV
    </Button>
  );
}

function DataTablePagination({
  pageIndex,
  pageCount,
  filteredCount,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: {
  pageIndex: number;
  pageCount: number;
  filteredCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
      <div>
        Página {pageIndex + 1} de {pageCount} ({filteredCount} itens)
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrevious} disabled={!canPrevious}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!canNext}>
          Próxima
        </Button>
      </div>
    </div>
  );
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

  const searchInputId = React.useId();
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-4">
      {hideToolbar ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <DataTableSearch
              table={table}
              searchColumn={searchColumn}
              globalFilter={globalFilter}
              onGlobalFilterChange={setGlobalFilter}
              id={searchInputId}
              label={searchLabel}
              placeholder={searchPlaceholder}
            />
            <DataTableFilter
              table={table}
              filterColumn={filterColumn}
              filterOptions={filterOptions}
              placeholder={filterPlaceholder}
              label={filterLabel}
            />
          </div>
          <DataTableExportButton visible={Boolean(exportColumns)} onExport={handleExport} />
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
            {rows.length > 0 ? (
              rows.map((row) => {
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
                <TableCell colSpan={columns.length} className="p-0">
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <SearchX aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>Nenhum registro encontrado.</EmptyTitle>
                      <EmptyDescription>
                        Ajuste a busca ou os filtros para ver outros resultados.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        pageIndex={table.state.pagination.pageIndex}
        pageCount={table.getPageCount()}
        filteredCount={table.getFilteredRowModel().rows.length}
        canPrevious={table.getCanPreviousPage()}
        canNext={table.getCanNextPage()}
        onPrevious={() => table.previousPage()}
        onNext={() => table.nextPage()}
      />
    </div>
  );
}
