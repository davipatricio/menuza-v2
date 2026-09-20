"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table.tsx";
import { type OrderItem, MOCK_ORDERS } from "@/lib/mock-management-data.ts";

const STATUS_LABELS: Record<OrderItem["status"], string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  READY: "Pronto",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

const columns: ColumnDef<OrderItem>[] = [
  {
    accessorKey: "code",
    header: "Código",
  },
  {
    accessorKey: "customerName",
    header: "Cliente",
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const val = row.original.total;

      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => STATUS_LABELS[row.original.status] ?? row.original.status,
  },
  {
    accessorKey: "createdAt",
    header: "Data/Hora",
  },
];

export default function OrdersManagePage() {
  return (
    <section aria-labelledby="orders-heading" className="space-y-6">
      <div>
        <h2 id="orders-heading" className="text-2xl font-semibold tracking-tight">
          Pedidos
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Listagem densa de pedidos da loja (dados demonstrativos UI-only).
        </p>
      </div>

      <DataTable
        columns={columns}
        data={MOCK_ORDERS}
        searchPlaceholder="Buscar por cliente ou código…"
        searchLabel="Filtrar pedidos"
        exportFilename="pedidos-menuza"
        exportColumns={[
          { key: "code", label: "Código" },
          { key: "customerName", label: "Cliente" },
          { key: "total", label: "Total", accessor: (r) => r.total.toFixed(2) },
          { key: "status", label: "Status", accessor: (r) => STATUS_LABELS[r.status] },
          { key: "createdAt", label: "Data" },
        ]}
      />
    </section>
  );
}
