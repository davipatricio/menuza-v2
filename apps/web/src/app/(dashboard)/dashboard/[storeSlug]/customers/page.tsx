"use client";

import { useMemo } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table.tsx";
import { dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatBrl } from "@/lib/format.ts";
import { getStore, getStoreCustomerStats, getStoreCustomers } from "@/lib/mock-dashboard-data.ts";
import type { CustomerItem } from "@/lib/mock-store-data.ts";
import { EmptyState } from "../_components/empty-state.tsx";

/** Customer row enriched with aggregates derived from the order fixtures. */
interface CustomerRow extends CustomerItem {
  ordersCount: number;
  totalSpent: number;
}

function customerColumns(
  basePath: string,
): ColumnDef<typeof dashboardTableFeatures, CustomerRow, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <Link
          href={`${basePath}/customers/${row.original.id}`}
          className="font-medium underline underline-offset-4"
        >
          {row.original.name}
        </Link>
      ),
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
      cell: ({ row }) => <span className="tabular-nums">{row.original.ordersCount}</span>,
    },
    {
      accessorKey: "totalSpent",
      header: "Total gasto",
      cell: ({ row }) => <span className="tabular-nums">{formatBrl(row.original.totalSpent)}</span>,
    },
  ];
}

export default function CustomersPage() {
  const params = useParams<{ storeSlug: string }>();
  const storeSlug = params.storeSlug ?? "";
  const store = getStore(storeSlug);
  const basePath = `/dashboard/${storeSlug}`;
  const columns = useMemo(() => customerColumns(basePath), [basePath]);

  if (!store) notFound();

  const customers: CustomerRow[] = getStoreCustomers(store.slug).map((customer) => ({
    ...customer,
    ...getStoreCustomerStats(store.slug, customer.id),
  }));

  return (
    <section aria-labelledby="customers-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="customers-heading" className="text-xl font-semibold tracking-tight">
          Clientes
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Base de clientes de {store.displayName} (dados demonstrativos).
        </p>
      </div>

      {customers.length ? (
        <DataTable
          columns={columns}
          data={customers}
          tableLabel="Clientes"
          rowHref={(customer) => `${basePath}/customers/${customer.id}`}
          searchPlaceholder="Buscar por nome ou e-mail…"
          searchLabel="Filtrar clientes"
          exportFilename={`clientes-${store.slug}`}
          exportColumns={[
            { key: "name", label: "Nome" },
            { key: "email", label: "E-mail" },
            { key: "phone", label: "Telefone" },
            { key: "ordersCount", label: "Pedidos" },
            { key: "totalSpent", label: "Total gasto", accessor: (r) => r.totalSpent.toFixed(2) },
          ]}
        />
      ) : (
        <EmptyState>Nenhum cliente ainda. Os clientes da loja aparecem aqui.</EmptyState>
      )}
    </section>
  );
}
