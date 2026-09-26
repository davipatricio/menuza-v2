"use client";

/**
 * Coupon table. A client island: the server page reads the coupons and hands
 * them down. `valueCents`/`valuePercent` arrive already split by the API so the
 * UI never re-interprets the single `value` column.
 */
import type { ColumnDef } from "@tanstack/react-table";
import type { PanelCoupon } from "@menuza/shared/tenant";
import { Badge } from "@/components/ui/badge.tsx";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatBrl } from "@/lib/format.ts";
import {
  COUPON_STATUS_LABELS,
  COUPON_STATUS_VARIANTS,
  DISCOUNT_TYPE_LABELS,
} from "@/lib/panel-labels.ts";

const columns: ColumnDef<typeof dashboardTableFeatures, PanelCoupon, unknown>[] = [
  {
    accessorKey: "code",
    header: "Cupom",
  },
  {
    accessorKey: "discountType",
    header: "Tipo",
    cell: ({ row }) => DISCOUNT_TYPE_LABELS[row.original.discountType],
  },
  {
    accessorKey: "value",
    header: "Desconto",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.valuePercent !== null
          ? `${row.original.valuePercent}%`
          : formatBrl(row.original.valueCents ?? 0)}
      </span>
    ),
  },
  {
    accessorKey: "usageCount",
    header: "Usos",
    cell: ({ row }) => <span className="tabular-nums">{row.original.usageCount}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={COUPON_STATUS_VARIANTS[row.original.status]}>
        {COUPON_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
  },
];

export function CouponsTable({
  coupons,
  storeSlug,
}: {
  coupons: PanelCoupon[];
  storeSlug: string;
}) {
  return (
    <DataTable
      columns={columns}
      data={coupons}
      tableLabel="Cupons"
      searchPlaceholder="Buscar por código de cupom…"
      searchLabel="Filtrar cupons"
      exportFilename={`cupons-${storeSlug}`}
      exportColumns={[
        { key: "code", label: "Código" },
        {
          key: "discountType",
          label: "Tipo",
          accessor: (r) => DISCOUNT_TYPE_LABELS[r.discountType],
        },
        {
          key: "value",
          label: "Valor",
          accessor: (r) =>
            r.valuePercent !== null ? `${r.valuePercent}%` : (r.valueCents ?? 0) / 100,
        },
        { key: "usageCount", label: "Usos" },
        { key: "status", label: "Status", accessor: (r) => COUPON_STATUS_LABELS[r.status] },
      ]}
    />
  );
}
