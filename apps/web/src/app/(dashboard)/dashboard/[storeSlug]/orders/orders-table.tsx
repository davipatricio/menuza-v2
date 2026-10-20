"use client";

/**
 * Order table. A client island: the server page reads the rows through the panel
 * contract and hands them down, so sorting, filtering and CSV export stay in the
 * browser while the data comes from the API.
 */
import { useMemo } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import type { PanelOrder } from "@menuza/shared/tenant";
import { Badge } from "@/components/ui/badge.tsx";
import { DataTable, type DataTableFilterOption } from "@/components/ui/data-table.tsx";
import { dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatBrl } from "@/lib/format.ts";
import {
  FINANCIAL_STATUS_LABELS,
  FINANCIAL_STATUS_VARIANTS,
  FULFILMENT_STATUS_LABELS,
  FULFILMENT_STATUS_VARIANTS,
} from "@/lib/panel-labels.ts";

const STATUS_FILTER_OPTIONS: DataTableFilterOption[] = Object.entries(FULFILMENT_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

function columns(
  basePath: string,
): ColumnDef<typeof dashboardTableFeatures, PanelOrder, unknown>[] {
  return [
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ row }) => (
        <Link
          href={`${basePath}/orders/${row.original.code}`}
          className="font-medium underline underline-offset-4"
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Cliente",
    },
    {
      accessorKey: "totalCents",
      header: "Total",
      cell: ({ row }) => <span className="tabular-nums">{formatBrl(row.original.totalCents)}</span>,
    },
    {
      accessorKey: "fulfilmentStatus",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={FULFILMENT_STATUS_VARIANTS[row.original.fulfilmentStatus]}>
            {FULFILMENT_STATUS_LABELS[row.original.fulfilmentStatus]}
          </Badge>
          <Badge variant={FINANCIAL_STATUS_VARIANTS[row.original.financialStatus]}>
            {FINANCIAL_STATUS_LABELS[row.original.financialStatus]}
          </Badge>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Data/Hora",
    },
  ];
}

export function OrdersTable({
  orders,
  basePath,
  storeSlug,
  hideToolbar = false,
  tableLabel = "Pedidos",
}: {
  orders: PanelOrder[];
  basePath: string;
  storeSlug: string;
  hideToolbar?: boolean;
  tableLabel?: string;
}) {
  const columnDefs = useMemo(() => columns(basePath), [basePath]);

  return (
    <DataTable
      columns={columnDefs}
      data={orders}
      tableLabel={tableLabel}
      rowHref={(order) => `${basePath}/orders/${order.code}`}
      hideToolbar={hideToolbar}
      searchPlaceholder="Buscar por cliente ou código…"
      searchLabel="Filtrar pedidos"
      exportFilename={`pedidos-${storeSlug}`}
      exportColumns={[
        { key: "code", label: "Código" },
        { key: "customerName", label: "Cliente" },
        { key: "totalCents", label: "Total", accessor: (r) => (r.totalCents / 100).toFixed(2) },
        {
          key: "fulfilmentStatus",
          label: "Status",
          accessor: (r) => FULFILMENT_STATUS_LABELS[r.fulfilmentStatus] ?? r.fulfilmentStatus,
        },
        { key: "createdAt", label: "Data" },
      ]}
      filterColumn="fulfilmentStatus"
      filterOptions={STATUS_FILTER_OPTIONS}
      filterPlaceholder="Status…"
      filterLabel="Filtrar por status"
    />
  );
}
