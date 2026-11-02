import { createFileRoute, redirect } from "@tanstack/react-router";
import { Award } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { BadgeCreateButton, BadgesTable } from "@/features/catalog/components/badges-table.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { listBadgesFn } from "@/features/catalog/server/taxonomy-lists.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/badges/")({
  loader: async ({ params }) => {
    const payload = await listBadgesFn({ data: { storeSlug: params.storeSlug } });

    if (!payload) throw redirect({ href: "/dashboard/login" });

    return { badges: payload.badges };
  },
  head: () => ({ meta: [{ title: pageTitle("Etiquetas") }] }),
  pendingComponent: () => <TableLoading label="Carregando etiquetas" />,
  component: BadgesPage,
});

function BadgesPage() {
  const { badges } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();

  return (
    <section aria-labelledby="badges-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="badges-heading" className="text-xl font-semibold tracking-tight">
            Etiquetas
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie as imagens que destacam atributos dos produtos no cardápio.
          </p>
        </div>
        <BadgeCreateButton storeSlug={storeSlug} />
      </div>

      {badges.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Award aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhuma etiqueta cadastrada</EmptyTitle>
            <EmptyDescription>
              Crie a primeira etiqueta para marcar produtos como mais vendidos, sem lactose ou
              artesanais.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <BadgeCreateButton storeSlug={storeSlug} label="Criar primeira etiqueta" />
          </EmptyContent>
        </Empty>
      ) : (
        <BadgesTable badges={badges} storeSlug={storeSlug} />
      )}
    </section>
  );
}
