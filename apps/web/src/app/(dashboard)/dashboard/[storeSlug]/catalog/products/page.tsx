import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { formatBrl } from "@/lib/format.ts";

export default async function CatalogProductsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const client = await panelClient();
  if (!client) notFound();

  const { products } = await client.panel.listProducts({ storeSlug });

  return (
    <section aria-labelledby="products-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="products-heading" className="text-xl font-semibold tracking-tight">Produtos</h2>
        <p className="text-sm text-muted-foreground">Produtos do catálogo com preço padrão.</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border shadow-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left font-medium">Nome</th>
              <th className="px-4 py-3 text-left font-medium">Categoria</th>
              <th className="px-4 py-3 text-right font-medium">Preço</th>
              <th className="px-4 py-3 text-left font-medium">Disponível</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{product.name}</td>
                <td className="px-4 py-3">{product.categoryName ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {product.priceCents === null ? "—" : formatBrl(product.priceCents)}
                </td>
                <td className="px-4 py-3">{product.available ? "Sim" : "Não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}