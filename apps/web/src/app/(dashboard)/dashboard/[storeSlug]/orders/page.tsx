"use client";

import { useMemo } from "react";
import { notFound, useParams } from "next/navigation";
import { DataTable, type DataTableFilterOption } from "@/components/ui/data-table.tsx";
import { ORDER_STATUS_LABELS, getStore, getStoreOrders } from "@/lib/mock-dashboard-data.ts";
import { EmptyState } from "../_components/empty-state.tsx";
import { orderColumns } from "./columns.tsx";

const STATUS_FILTER_OPTIONS: DataTableFilterOption[] = Object.entries(ORDER_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export default function OrdersPage() {
  const params = useParams<{ storeSlug: string }>();
  const storeSlug = params.storeSlug ?? "";
  const store = getStore(storeSlug);
  const basePath = `/dashboard/${storeSlug}`;
  const columns = useMemo(() => orderColumns(basePath), [basePath]);

  if (!store) notFound();

  const orders = getStoreOrders(store.slug);

  return (
    <section aria-labelledby="orders-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="orders-heading" className="text-xl font-semibold tracking-tight">
          Pedidos
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Listagem densa de pedidos de {store.displayName} (dados demonstrativos).
        </p>
      </div>

      {orders.length ? (
        <DataTable
          columns={columns}
          data={orders}
          tableLabel="Pedidos"
          rowHref={(order) => `${basePath}/orders/${order.code}`}
          searchPlaceholder="Buscar por cliente ou código…"
          searchLabel="Filtrar pedidos"
          exportFilename={`pedidos-${store.slug}`}
          exportColumns={[
            { key: "code", label: "Código" },
            { key: "customerName", label: "Cliente" },
            { key: "total", label: "Total", accessor: (r) => r.total.toFixed(2) },
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
      ) : (
        <EmptyState>Nenhum pedido ainda. Os pedidos da loja aparecem aqui.</EmptyState>
      )}
    </section>
  );
}
