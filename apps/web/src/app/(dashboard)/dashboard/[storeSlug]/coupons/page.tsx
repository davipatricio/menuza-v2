"use client";

import { notFound, useParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge.tsx";
import { DataTable } from "@/components/ui/data-table.tsx";
import { dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatBrl } from "@/lib/format.ts";
import { getStore, getStoreCoupons } from "@/lib/mock-dashboard-data.ts";
import type { CouponItem } from "@/lib/mock-store-data.ts";
import { EmptyState } from "../_components/empty-state.tsx";

const COUPON_STATUS_LABELS: Record<CouponItem["status"], string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Expirado",
  DISABLED: "Desativado",
};

const columns: ColumnDef<typeof dashboardTableFeatures, CouponItem, unknown>[] = [
  {
    accessorKey: "code",
    header: "Cupom",
  },
  {
    accessorKey: "discountType",
    header: "Tipo",
    cell: ({ row }) =>
      row.original.discountType === "PERCENTAGE" ? "Porcentagem (%)" : "Valor fixo (R$)",
  },
  {
    accessorKey: "value",
    header: "Desconto",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.discountType === "PERCENTAGE"
          ? `${row.original.value}%`
          : formatBrl(row.original.value)}
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
      <Badge
        variant={
          row.original.status === "ACTIVE"
            ? "default"
            : row.original.status === "DISABLED"
              ? "secondary"
              : "destructive"
        }
      >
        {COUPON_STATUS_LABELS[row.original.status]}
      </Badge>
    ),
  },
];

export default function CouponsPage() {
  const params = useParams<{ storeSlug: string }>();
  const storeSlug = params.storeSlug ?? "";
  const store = getStore(storeSlug);

  if (!store) notFound();

  const coupons = getStoreCoupons(store.slug);

  return (
    <section aria-labelledby="coupons-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="coupons-heading" className="text-xl font-semibold tracking-tight">
          Cupons
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Cupons promocionais de {store.displayName} (dados demonstrativos).
        </p>
      </div>

      {coupons.length ? (
        <DataTable
          columns={columns}
          data={coupons}
          tableLabel="Cupons"
          searchPlaceholder="Buscar por código de cupom…"
          searchLabel="Filtrar cupons"
          exportFilename={`cupons-${store.slug}`}
          exportColumns={[
            { key: "code", label: "Código" },
            { key: "discountType", label: "Tipo" },
            { key: "value", label: "Valor" },
            { key: "usageCount", label: "Usos" },
            {
              key: "status",
              label: "Status",
              accessor: (r) => COUPON_STATUS_LABELS[r.status],
            },
          ]}
        />
      ) : (
        <EmptyState>Nenhum cupom ainda. Os cupons da loja aparecem aqui.</EmptyState>
      )}
    </section>
  );
}
