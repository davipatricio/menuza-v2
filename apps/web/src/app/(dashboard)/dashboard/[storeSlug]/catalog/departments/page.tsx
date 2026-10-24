import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
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

async function getDepartments(storeSlug: string) {
  "use cache: private";
  cacheTag(`dashboard:departments:${storeSlug}`);
  cacheLife({ stale: 300 });
  const client = await panelClient();

  if (!client) return null;
  const { departments } = await client.panel.listDepartments({ storeSlug });

  return departments;
}

export const instant = true;

export default function CatalogDepartmentsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando departamentos" />}>
      <CatalogDepartments params={params} />
    </Suspense>
  );
}

async function CatalogDepartments({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const departments = await getDepartments(storeSlug);

  if (!departments) notFound();

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

      {departments.length === 0 ? (
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
        <DepartmentsTable departments={departments} storeSlug={storeSlug} />
      )}
    </section>
  );
}
