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
import { DepartmentsTable } from "@/features/catalog/components/departments-table.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { TaxonomyCreateDialog } from "@/features/catalog/components/taxonomy-dialog.tsx";
import { loadDepartmentSearchParams } from "@/features/catalog/schemas/department-search.ts";
import {
  listDepartmentsFn,
  listTaxonomyOptionsFn,
} from "@/features/catalog/server/taxonomy-lists.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/departments/")({
  // SAFETY: the router hands back raw query values (string, or string[] for a
  // repeated key); the loader narrows them through nuqs, so defaults never get
  // written into the URL and no canonicalising redirect fires.
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const filters = loadDepartmentSearchParams(deps);

    const [payload, options] = await Promise.all([
      listDepartmentsFn({
        data: {
          storeSlug: params.storeSlug,
          q: filters.q,
          status: filters.status,
          sort: filters.sort,
          order: filters.order,
        },
      }),
      listTaxonomyOptionsFn({ data: { storeSlug: params.storeSlug } }),
    ]);

    if (!payload || !options) throw redirect({ href: "/dashboard/login" });

    return { departments: payload.departments, categories: options.categories, filters };
  },
  head: () => ({ meta: [{ title: pageTitle("Departamentos") }] }),
  pendingComponent: () => <TableLoading label="Carregando departamentos" />,
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const { departments, categories, filters } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();
  const hasFilters = filters.q.trim() !== "" || filters.status !== "all";

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
        <DepartmentsTable departments={departments} storeSlug={storeSlug} categories={categories} />
      )}
    </section>
  );
}
