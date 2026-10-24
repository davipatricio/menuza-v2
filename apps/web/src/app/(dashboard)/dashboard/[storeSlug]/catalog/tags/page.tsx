import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { Tag } from "lucide-react";
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
import { TaxonomyCreateDialog } from "../_components/taxonomy-dialog.tsx";
import { TagsTable } from "./tags-table";
import { loadTagSearchParams, type TagSearchParams } from "./tags-search-params.ts";

async function getTags(
  storeSlug: string,
  sortBy: TagSearchParams["sort"],
  order: TagSearchParams["order"],
) {
  "use cache: private";
  cacheTag(`dashboard:tags:${storeSlug}`);
  cacheLife({ stale: 300 });
  const client = await panelClient();

  if (!client) return null;

  const { tags } = await client.panel.listTags({ storeSlug, sortBy, order });

  return tags;
}

export const instant = true;

export default function CatalogTagsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando tags" />}>
      <CatalogTags params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogTags({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ storeSlug }, { sort, order }] = await Promise.all([
    params,
    loadTagSearchParams(searchParams),
  ]);

  const tags = await getTags(storeSlug, sort, order);

  if (!tags) notFound();

  return (
    <section aria-labelledby="tags-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="tags-heading" className="text-xl font-semibold tracking-tight">
            Tags
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie as tags que marcam os produtos no cardápio.
          </p>
        </div>
        <TaxonomyCreateDialog entity="tag" storeSlug={storeSlug} />
      </div>

      {tags.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Tag aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhuma tag cadastrada</EmptyTitle>
            <EmptyDescription>
              Crie a primeira tag para marcar produtos no cardápio.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <TaxonomyCreateDialog entity="tag" storeSlug={storeSlug} label="Criar primeira tag" />
          </EmptyContent>
        </Empty>
      ) : (
        <TagsTable tags={tags} storeSlug={storeSlug} />
      )}
    </section>
  );
}
