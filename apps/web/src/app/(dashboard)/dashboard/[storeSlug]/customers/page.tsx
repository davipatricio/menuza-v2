import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { EmptyState } from "../_components/empty-state.tsx";
import { CustomersTable } from "./customers-table.tsx";

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { customers } = await client.panel.listCustomers({ storeSlug });
  const basePath = `/dashboard/${storeSlug}`;

  return (
    <section aria-labelledby="customers-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="customers-heading" className="text-xl font-semibold tracking-tight">
          Clientes
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Base de clientes da loja. Os totais vêm dos pedidos dela.
        </p>
      </div>

      {customers.length ? (
        <CustomersTable customers={customers} basePath={basePath} storeSlug={storeSlug} />
      ) : (
        <EmptyState>Nenhum cliente ainda. Os clientes da loja aparecem aqui.</EmptyState>
      )}
    </section>
  );
}
