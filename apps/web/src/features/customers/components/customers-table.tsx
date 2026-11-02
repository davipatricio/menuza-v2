/**
 * Customer table. A client island: the route loader reads the rows and hands
 * them down; sorting, search and CSV export stay in the browser.
 */
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { PanelCustomer } from "@menuza/shared/tenant";
import { DataTable, dashboardTableFeatures } from "@/components/ui/data-table.tsx";
import { formatBrl } from "@/lib/format.ts";

function columns(
  storeSlug: string,
): ColumnDef<typeof dashboardTableFeatures, PanelCustomer, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <Link
          to="/dashboard/$storeSlug/customers/$customerId"
          params={{ storeSlug, customerId: row.original.id }}
          preload="intent"
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
      accessorKey: "totalSpentCents",
      header: "Total gasto",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatBrl(row.original.totalSpentCents)}</span>
      ),
    },
  ];
}

export function CustomersTable({
  customers,
  storeSlug,
}: {
  customers: PanelCustomer[];
  storeSlug: string;
}) {
  const columnDefs = useMemo(() => columns(storeSlug), [storeSlug]);
  const basePath = `/dashboard/${storeSlug}`;

  return (
    <DataTable
      columns={columnDefs}
      data={customers}
      tableLabel="Clientes"
      rowHref={(customer) => `${basePath}/customers/${customer.id}`}
      searchPlaceholder="Buscar por nome ou e-mail…"
      searchLabel="Filtrar clientes"
      exportFilename={`clientes-${storeSlug}`}
      exportColumns={[
        { key: "name", label: "Nome" },
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Telefone" },
        { key: "ordersCount", label: "Pedidos" },
        {
          key: "totalSpentCents",
          label: "Total gasto",
          accessor: (r) => (r.totalSpentCents / 100).toFixed(2),
        },
      ]}
    />
  );
}
