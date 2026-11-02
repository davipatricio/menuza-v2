import { createFileRoute, redirect } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { KitsTable } from "@/features/catalog/components/kits-table.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { listKitsFn } from "@/features/catalog/server/taxonomy-lists.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/kits/")({
  loader: async ({ params }) => {
    const payload = await listKitsFn({ data: { storeSlug: params.storeSlug } });

    if (!payload) throw redirect({ href: "/dashboard/login" });

    return { kits: payload.kits };
  },
  head: () => ({ meta: [{ title: pageTitle("Kits") }] }),
  pendingComponent: () => <TableLoading label="Carregando kits" />,
  component: KitsPage,
});

function KitsPage() {
  const { kits } = Route.useLoaderData();

  return (
    <section aria-labelledby="kits-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="kits-heading" className="text-xl font-semibold tracking-tight">
          Kits
        </h2>
        <p className="text-sm text-muted-foreground">Kits da loja.</p>
      </div>
      <Alert>
        <AlertTitle>Kits são somente leitura por enquanto</AlertTitle>
        <AlertDescription>
          A precificação de kits ainda está em definição. Esta lista mostra os kits da loja sem
          edição.
        </AlertDescription>
      </Alert>
      <KitsTable kits={kits} />
    </section>
  );
}
