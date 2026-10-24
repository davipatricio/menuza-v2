import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FolderTree } from "lucide-react";
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
import { CategoriesTable } from "./categories-table";
import { loadCategorySearchParams } from "./category-search-params.ts";

// Deliberately uncached: `router.refresh()` after a save clears only the current
// route's client cache, so a TTL here would show the user their own edit.
export const instant = true;

export default function CatalogCategoriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando categorias" />}>
      <CatalogCategories params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogCategories({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ storeSlug }, filters, client] = await Promise.all([
    params,
    loadCategorySearchParams(searchParams),
    panelClient(),
  ]);

  if (!client) notFound();

  const [{ categories }, { departments }] = await Promise.all([
    client.panel.listCategories({
      storeSlug,
      q: filters.q,
      status: filters.status,
      departmentId: filters.department,
      sortBy: filters.sort,
      order: filters.order,
    }),
    client.panel.listDepartments({ storeSlug }),
  ]);

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
        <TaxonomyCreateDialog
          entity="category"
          storeSlug={storeSlug}
          departments={departments.map((department) => ({
            id: department.id,
            name: department.name,
          }))}
        />
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
              departments={departments.map((department) => ({
                id: department.id,
                name: department.name,
              }))}
            />
          </EmptyContent>
        </Empty>
      ) : (
        <CategoriesTable
          categories={categories}
          storeSlug={storeSlug}
          departments={departments.map((department) => ({
            id: department.id,
            name: department.name,
          }))}
        />
      )}
    </section>
  );
}
