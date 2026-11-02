import { createFileRoute, redirect } from "@tanstack/react-router";
import { CustomersTable } from "@/features/customers/components/customers-table.tsx";
import { listCustomersFn } from "@/features/customers/server/customers.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/customers/")({
  loader: async ({ params }) => {
    const payload = await listCustomersFn({ data: { storeSlug: params.storeSlug } });

    if (!payload) throw redirect({ href: "/dashboard/login" });

    return { customers: payload.customers };
  },
  head: () => ({ meta: [{ title: pageTitle("Clientes") }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { customers } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();

  return (
    <section aria-labelledby="customers-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="customers-heading" className="text-xl font-semibold tracking-tight">
          Clientes
        </h2>
        <p className="text-sm text-muted-foreground">
          Base de clientes da loja. Os totais vêm dos pedidos dela.
        </p>
      </div>

      <CustomersTable storeSlug={storeSlug} customers={customers} />
    </section>
  );
}
