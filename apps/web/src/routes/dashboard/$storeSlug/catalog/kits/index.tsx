import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
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
  const { storeSlug } = Route.useParams();

  return (
    <section aria-labelledby="kits-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="kits-heading" className="text-xl font-semibold tracking-tight">
            Kits
          </h2>
          <p className="text-sm text-muted-foreground">
            Combinações de pratos vendidas como um conjunto, com preço e regras próprias.
          </p>
        </div>
        <Button
          render={<Link to="/dashboard/$storeSlug/catalog/kits/new" params={{ storeSlug }} />}
        >
          Novo kit
        </Button>
      </div>

      {kits.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum kit cadastrado</EmptyTitle>
            <EmptyDescription>
              Crie o primeiro kit para vender uma combinação de pratos com preço fechado.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              render={<Link to="/dashboard/$storeSlug/catalog/kits/new" params={{ storeSlug }} />}
            >
              Criar kit
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <KitsTable kits={kits} storeSlug={storeSlug} />
      )}
    </section>
  );
}
