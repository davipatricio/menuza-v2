import { createFileRoute, redirect } from "@tanstack/react-router";
import { FolderTree } from "lucide-react";
import type { SearchParams } from "nuqs/server";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { CategoriesTable } from "@/features/catalog/components/categories-table.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { TaxonomyCreateDialog } from "@/features/catalog/components/taxonomy-dialog.tsx";
import { loadCategorySearchParams } from "@/features/catalog/schemas/category-search.ts";
import {
  listCategoriesFn,
  listDepartmentsFn,
} from "@/features/catalog/server/taxonomy-lists.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/categories/")({
  // SAFETY: raw query values in; the loader parses them through nuqs so defaults
  // never land in the URL (which would trigger a canonicalising redirect).
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const filters = loadCategorySearchParams(deps);

    const [payload, departments] = await Promise.all([
      listCategoriesFn({
        data: {
          storeSlug: params.storeSlug,
          q: filters.q,
          status: filters.status,
          departmentId: filters.department,
          sort: filters.sort,
          order: filters.order,
        },
      }),
      listDepartmentsFn({ data: { storeSlug: params.storeSlug } }),
    ]);

    if (!payload || !departments) throw redirect({ href: "/dashboard/login" });

    return {
      categories: payload.categories,
      departments: departments.departments.map((row) => ({ id: row.id, name: row.name })),
      filters,
    };
  },
  head: () => ({ meta: [{ title: pageTitle("Categorias") }] }),
  pendingComponent: () => <TableLoading label="Carregando categorias" />,
  component: CategoriesPage,
});

function CategoriesPage() {
  const { categories, departments, filters } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();

  const hasFilters =
    filters.q.trim() !== "" || filters.status !== "all" || filters.department !== "";

  return (
    <section aria-labelledby="categories-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="categories-heading" className="text-xl font-semibold tracking-tight">
            Categorias
          </h2>
          <p className="text-sm text-muted-foreground">Categorias do catálogo.</p>
        </div>
        <TaxonomyCreateDialog entity="category" storeSlug={storeSlug} departments={departments} />
      </div>

      {categories.length === 0 && !hasFilters ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderTree aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhuma categoria cadastrada</EmptyTitle>
            <EmptyDescription>
              Cadastre a primeira categoria para organizar as subcategorias e os produtos.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <TaxonomyCreateDialog
              entity="category"
              storeSlug={storeSlug}
              departments={departments}
            />
          </EmptyContent>
        </Empty>
      ) : (
        <CategoriesTable categories={categories} storeSlug={storeSlug} departments={departments} />
      )}
    </section>
  );
}
