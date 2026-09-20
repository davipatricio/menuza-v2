"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table.tsx";
import { type CouponItem, MOCK_COUPONS } from "@/lib/mock-management-data.ts";

const STATUS_LABELS: Record<CouponItem["status"], string> = {
  ACTIVE: "Ativo",
  EXPIRED: "Expirado",
  DISABLED: "Desativado",
};

const columns: ColumnDef<CouponItem>[] = [
  {
    accessorKey: "code",
    header: "Cupom",
  },
  {
    accessorKey: "discountType",
    header: "Tipo",
    cell: ({ row }) =>
      row.original.discountType === "PERCENTAGE" ? "Porcentagem (%)" : "Valor Fixo (R$)",
  },
  {
    accessorKey: "value",
    header: "Desconto",
    cell: ({ row }) => {
      const val = row.original.value;

      return row.original.discountType === "PERCENTAGE"
        ? `${val}%`
        : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
    },
  },
  {
    accessorKey: "usageCount",
    header: "Usos",
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => STATUS_LABELS[row.original.status] ?? row.original.status,
  },
];

export default function CouponsManagePage() {
  return (
    <section aria-labelledby="coupons-heading" className="space-y-6">
      <div>
        <h2 id="coupons-heading" className="text-2xl font-semibold tracking-tight">
          Cupons
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Gerenciamento de cupons promocionais (dados demonstrativos UI-only).
        </p>
      </div>

      <DataTable
        columns={columns}
        data={MOCK_COUPONS}
        searchPlaceholder="Buscar por código de cupom…"
        searchLabel="Filtrar cupons"
        exportFilename="cupons-menuza"
        exportColumns={[
          { key: "code", label: "Código" },
          { key: "discountType", label: "Tipo" },
          { key: "value", label: "Valor" },
          { key: "usageCount", label: "Usos" },
          { key: "status", label: "Status", accessor: (r) => STATUS_LABELS[r.status] },
        ]}
      />
    </section>
  );
}
