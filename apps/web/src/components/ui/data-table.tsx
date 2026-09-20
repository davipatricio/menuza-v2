"use client";

/* eslint-disable react/incompatible-library */
import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
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
import { Input } from "@/components/ui/input.tsx";
import { exportToCsv, type CsvColumn } from "@/lib/csv-export.ts";

export interface DataTableProps<TData extends object, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  searchLabel?: string;
  searchColumn?: string;
  exportFilename?: string;
  exportColumns?: Array<CsvColumn<TData>>;
}

export function DataTable<TData extends object, TValue>({
  columns,
  data,
  searchPlaceholder = "Filtrar resultados…",
  searchLabel = "Buscar na tabela",
  searchColumn,
  exportFilename = "export",
  exportColumns,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
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
        </div>
        {exportColumns && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            Exportar CSV
          </Button>
        )}
      </div>

      <div className="rounded-md border border-neutral-200 dark:border-neutral-800">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();

                  const ariaSortValue =
                    isSorted === "asc" ? "ascending" : isSorted === "desc" ? "descending" : "none";

                  return (
                    <TableHead key={header.id} aria-sort={canSort ? ariaSortValue : undefined}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 font-medium hover:text-neutral-900 dark:hover:text-neutral-100"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {isSorted === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden="true" />
                          ) : isSorted === "desc" ? (
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                          )}
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
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-neutral-500">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-2 px-1 text-sm text-neutral-600 dark:text-neutral-400">
        <div>
          Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1} (
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
    </div>
  );
}
