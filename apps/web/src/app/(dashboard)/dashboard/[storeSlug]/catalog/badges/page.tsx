import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { Award } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { panelClient } from "@/lib/server-tenant.ts";
import { TableLoading } from "../../_components/table-loading.tsx";
import { BadgeCreateButton, BadgesTable } from "./badges-table";

async function getBadges(storeSlug: string) {
  "use cache: private";
  cacheTag(`dashboard:badges:${storeSlug}`);
  cacheLife({ stale: 300 });
  const client = await panelClient();

  if (!client) return null;

  const { badges } = await client.panel.listBadges({ storeSlug });

  return badges;
}

export const instant = true;

export default function CatalogBadgesPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  return (
    <Suspense fallback={<TableLoading label="Carregando etiquetas" />}>
      <CatalogBadges params={params} />
    </Suspense>
  );
}

async function CatalogBadges({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const badges = await getBadges(storeSlug);

  if (!badges) notFound();

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
