import { createFileRoute, redirect } from "@tanstack/react-router";
import { Tag } from "lucide-react";
import type { SearchParams } from "nuqs/server";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { TagsTable } from "@/features/catalog/components/tags-table.tsx";
import { TaxonomyCreateDialog } from "@/features/catalog/components/taxonomy-dialog.tsx";
import { loadTagSearchParams } from "@/features/catalog/schemas/tags-search.ts";
import { listTagsFn } from "@/features/catalog/server/taxonomy-lists.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/tags/")({
  // SAFETY: raw query values in; the loader parses them through nuqs so defaults
  // never land in the URL (which would trigger a canonicalising redirect).
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const filters = loadTagSearchParams(deps);

    const payload = await listTagsFn({
      data: { storeSlug: params.storeSlug, sort: filters.sort, order: filters.order },
    });

    if (!payload) throw redirect({ href: "/dashboard/login" });

    return { tags: payload.tags };
  },
  head: () => ({ meta: [{ title: pageTitle("Tags") }] }),
  pendingComponent: () => <TableLoading label="Carregando tags" />,
  component: TagsPage,
});

function TagsPage() {
  const { tags } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();

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
