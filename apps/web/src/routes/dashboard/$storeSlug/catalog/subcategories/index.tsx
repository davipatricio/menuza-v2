import { createFileRoute, redirect } from "@tanstack/react-router";
import { ListTree } from "lucide-react";
import type { SearchParams } from "nuqs/server";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { SubcategoriesTable } from "@/features/catalog/components/subcategories-table.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { TaxonomyCreateDialog } from "@/features/catalog/components/taxonomy-dialog.tsx";
import { loadSubcategorySearchParams } from "@/features/catalog/schemas/subcategory-search.ts";
import {
  listCategoriesFn,
  listSubcategoriesFn,
} from "@/features/catalog/server/taxonomy-lists.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/subcategories/")({
  // SAFETY: raw query values in; the loader parses them through nuqs so defaults
  // never land in the URL (which would trigger a canonicalising redirect).
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const filters = loadSubcategorySearchParams(deps);

    const [payload, categories] = await Promise.all([
      listSubcategoriesFn({
        data: {
          storeSlug: params.storeSlug,
          q: filters.q,
          status: filters.status,
          categoryId: filters.category,
          sort: filters.sort,
          order: filters.order,
        },
      }),
      listCategoriesFn({ data: { storeSlug: params.storeSlug } }),
    ]);

    if (!payload || !categories) throw redirect({ href: "/dashboard/login" });

    return {
      subcategories: payload.subcategories,
      categories: categories.categories.map((row) => ({ id: row.id, name: row.name })),
      filters,
    };
  },
  head: () => ({ meta: [{ title: pageTitle("Subcategorias") }] }),
  pendingComponent: () => <TableLoading label="Carregando subcategorias" />,
  component: SubcategoriesPage,
});

function SubcategoriesPage() {
  const { subcategories, categories, filters } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();
  const hasFilters = filters.q.trim() !== "" || filters.status !== "all" || filters.category !== "";

  return (
    <section aria-labelledby="subcategories-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="subcategories-heading" className="text-xl font-semibold tracking-tight">
            Subcategorias
          </h2>
          <p className="text-sm text-muted-foreground">
            Detalhe as categorias em subcategorias para agrupar produtos semelhantes.
          </p>
        </div>
        <TaxonomyCreateDialog entity="subcategory" storeSlug={storeSlug} categories={categories} />
      </div>

      {subcategories.length === 0 && !hasFilters ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTree aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhuma subcategoria cadastrada</EmptyTitle>
            <EmptyDescription>
              Crie uma subcategoria para agrupar os produtos de uma categoria.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <TaxonomyCreateDialog
              entity="subcategory"
              storeSlug={storeSlug}
              categories={categories}
            />
          </EmptyContent>
        </Empty>
      ) : (
        <SubcategoriesTable
          subcategories={subcategories}
          storeSlug={storeSlug}
          categories={categories}
        />
      )}
    </section>
  );
}
