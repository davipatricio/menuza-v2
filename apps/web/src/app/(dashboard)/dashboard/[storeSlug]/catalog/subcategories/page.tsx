import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ListTree } from "lucide-react";
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
import { SubcategoriesTable } from "./subcategories-table";
import { loadSubcategorySearchParams } from "./subcategory-search-params.ts";

// Deliberately uncached: `router.refresh()` after a save clears only the current
// route's client cache, so a TTL here would show the user their own edit.
export const instant = true;

export default function CatalogSubcategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando subcategorias" />}>
      <CatalogSubcategories params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogSubcategories({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ storeSlug }, filters, client] = await Promise.all([
    params,
    loadSubcategorySearchParams(searchParams),
    panelClient(),
  ]);

  if (!client) notFound();

  const [{ subcategories }, { categories }] = await Promise.all([
    client.panel.listSubcategories({
      storeSlug,
      q: filters.q,
      status: filters.status,
      categoryId: filters.category,
      sortBy: filters.sort,
      order: filters.order,
    }),
    client.panel.listCategories({ storeSlug }),
  ]);

  const categoryOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  const hasFilters = filters.q.trim() !== "" || filters.status !== "all" || filters.category !== "";

  return (
    <section aria-labelledby="subcategories-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="subcategories-heading" className="text-xl font-semibold tracking-tight">
            Subcategorias
          </h2>
          <p className="text-sm text-muted-foreground">
            Organize os produtos dentro de cada categoria.
          </p>
        </div>
        <TaxonomyCreateDialog
          entity="subcategory"
          storeSlug={storeSlug}
          categories={categoryOptions}
        />
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
              categories={categoryOptions}
            />
          </EmptyContent>
        </Empty>
      ) : (
        <SubcategoriesTable
          subcategories={subcategories}
          storeSlug={storeSlug}
          categories={categoryOptions}
        />
      )}
    </section>
  );
}
