"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table.tsx";
import { type CustomerItem, MOCK_CUSTOMERS } from "@/lib/mock-management-data.ts";

const columns: ColumnDef<CustomerItem>[] = [
  {
    accessorKey: "name",
    header: "Nome",
  },
  {
    accessorKey: "email",
    header: "E-mail",
  },
  {
    accessorKey: "phone",
    header: "Telefone",
  },
  {
    accessorKey: "ordersCount",
    header: "Pedidos",
  },
  {
    accessorKey: "totalSpent",
    header: "Total Gasto",
    cell: ({ row }) => {
      const val = row.original.totalSpent;

      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
    },
  },
];

export default function CustomersManagePage() {
  return (
    <section aria-labelledby="customers-heading" className="space-y-6">
      <div>
        <h2 id="customers-heading" className="text-2xl font-semibold tracking-tight">
          Clientes
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Base de clientes cadastrados (dados demonstrativos UI-only).
        </p>
      </div>

      <DataTable
        columns={columns}
        data={MOCK_CUSTOMERS}
        searchPlaceholder="Buscar por nome ou e-mail…"
        searchLabel="Filtrar clientes"
        exportFilename="clientes-menuza"
        exportColumns={[
          { key: "name", label: "Nome" },
          { key: "email", label: "E-mail" },
          { key: "phone", label: "Telefone" },
          { key: "ordersCount", label: "Pedidos" },
          { key: "totalSpent", label: "Total Gasto", accessor: (r) => r.totalSpent.toFixed(2) },
        ]}
      />
    </section>
  );
}
