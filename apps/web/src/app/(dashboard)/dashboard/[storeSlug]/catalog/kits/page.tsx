import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { KitsTable } from "./kits-table";

export default async function CatalogKitsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const { kits } = await client.panel.listKits({ storeSlug });

  return (
    <section aria-labelledby="kits-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="kits-heading" className="text-xl font-semibold tracking-tight">
          Kits
        </h2>
        <p className="text-sm text-muted-foreground">Kits da loja.</p>
      </div>
      <KitsTable kits={kits} />
    </section>
  );
}
