import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";

export default async function CatalogCategoriesPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();
  if (!client) notFound();

  const { categories } = await client.panel.listCategories({ storeSlug });

  return (
    <section aria-labelledby="departments-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="categorias-heading" className="text-xl font-semibold tracking-tight">Categorias</h2>
        <p className="text-sm text-muted-foreground">Categorias do catálogo.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border shadow-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-right font-medium">Itens</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{entry.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{entry.itemsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}