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
import { ORDER_STATUS_LABELS, ORDER_STATUS_VARIANTS } from "@/lib/panel-labels.ts";

const STATUS_FILTER_OPTIONS: DataTableFilterOption[] = Object.entries(ORDER_STATUS_LABELS).map(
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
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={ORDER_STATUS_VARIANTS[row.original.status]}>
          {ORDER_STATUS_LABELS[row.original.status]}
        </Badge>
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
          key: "status",
          label: "Status",
          accessor: (r) => ORDER_STATUS_LABELS[r.status] ?? r.status,
        },
        { key: "createdAt", label: "Data" },
      ]}
      filterColumn="status"
      filterOptions={STATUS_FILTER_OPTIONS}
      filterPlaceholder="Status…"
      filterLabel="Filtrar por status"
    />
  );
}
