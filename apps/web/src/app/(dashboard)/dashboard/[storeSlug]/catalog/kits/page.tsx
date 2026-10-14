import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";

export default async function CatalogKitsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();
  if (!client) notFound();

  const { kits } = await client.panel.listKits({ storeSlug });

  return (
    <section aria-labelledby="kits-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="kits-heading" className="text-xl font-semibold tracking-tight">Kits</h2>
        <p className="text-sm text-muted-foreground">Kits da loja.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border shadow-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Modo</th>
              <th className="px-4 py-3 text-right font-medium">Itens</th>
              <th className="px-4 py-3 text-left font-medium">Disponível</th>
            </tr>
          </thead>
          <tbody>
            {kits.map((kit) => (
              <tr key={kit.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{kit.name}</td>
                <td className="px-4 py-3">{kit.mode}</td>
                <td className="px-4 py-3 text-right tabular-nums">{kit.itemsCount}</td>
                <td className="px-4 py-3">{kit.available ? "Sim" : "Não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}