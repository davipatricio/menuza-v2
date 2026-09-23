"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge.tsx";
import { dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatBrl } from "@/lib/format.ts";
import { ORDER_STATUS_LABELS } from "@/lib/mock-dashboard-data.ts";
import type { OrderItem } from "@/lib/mock-store-data.ts";

function statusVariant(status: OrderItem["status"]): "default" | "secondary" | "destructive" {
  if (status === "CANCELED" || status === "EXPIRED" || status === "REFUNDED") return "destructive";

  if (status === "PENDING" || status === "AWAITING_PAYMENT") return "secondary";

  return "default";
}

export function orderColumns(
  basePath: string,
): ColumnDef<typeof dashboardTableFeatures, OrderItem, unknown>[] {
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
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => <span className="tabular-nums">{formatBrl(row.original.total)}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={statusVariant(row.original.status)}>
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
