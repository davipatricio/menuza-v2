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
import { TaxonomyCreateDialog } from "../_components/taxonomy-dialog.tsx";
import { DepartmentsTable } from "./departments-table";

export const instant = false;

export default async function CatalogDepartmentsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { departments } = await client.panel.listDepartments({ storeSlug });

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
