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
import { DepartmentsTable } from "./departments-table";
import { loadDepartmentSearchParams } from "./department-search-params.ts";

// Deliberately uncached: `router.refresh()` after a save clears only the current
// route's client cache, so a TTL here would show the user their own edit.
export const instant = true;

export default function CatalogDepartmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando departamentos" />}>
      <CatalogDepartments params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogDepartments({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ storeSlug }, filters, client] = await Promise.all([
    params,
    loadDepartmentSearchParams(searchParams),
    panelClient(),
  ]);

  if (!client) notFound();

  const [{ departments }, { categories }] = await Promise.all([
    client.panel.listDepartments({
      storeSlug,
      q: filters.q,
      status: filters.status,
      sortBy: filters.sort,
      order: filters.order,
    }),
    client.panel.listCategories({ storeSlug }),
  ]);

  const hasFilters = filters.q.trim() !== "" || filters.status !== "all";

  const moveCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    departmentIds: category.departmentIds,
  }));

  return (
    <section aria-labelledby="departments-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="departments-heading" className="text-xl font-semibold tracking-tight">
            Departamentos
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os departamentos do catálogo e veja os produtos de cada um.
          </p>
        </div>
        <TaxonomyCreateDialog entity="department" storeSlug={storeSlug} />
      </div>

      {departments.length === 0 && !hasFilters ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderTree aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum departamento cadastrado</EmptyTitle>
            <EmptyDescription>
              Cadastre o primeiro departamento para organizar os produtos da loja.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <TaxonomyCreateDialog entity="department" storeSlug={storeSlug} />
          </EmptyContent>
        </Empty>
      ) : (
        <DepartmentsTable
          departments={departments}
          storeSlug={storeSlug}
          categories={moveCategories}
        />
      )}
    </section>
  );
}
