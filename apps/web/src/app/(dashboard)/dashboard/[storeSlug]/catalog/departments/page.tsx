import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { TaxonomyCreateDialog } from "../_components/taxonomy-dialog.tsx";
import { DepartmentsTable } from "./departments-table";

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id="departments-heading" className="text-xl font-semibold tracking-tight">
            Departamentos
          </h2>
          <p className="text-sm text-muted-foreground">Departamentos do catálogo.</p>
        </div>
        <TaxonomyCreateDialog entity="department" storeSlug={storeSlug} />
      </div>
      <DepartmentsTable departments={departments} storeSlug={storeSlug} />
    </section>
  );
}
