import { notFound } from "next/navigation";
import { panelClient } from "@/lib/server-tenant.ts";
import { ProductForm } from "../product-form.tsx";

// Reads the session and the store slug on every request, like the shell.
export const instant = false;

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const client = await panelClient();

  if (!client) notFound();

  const [{ categories }, { departments }, { tags }] = await Promise.all([
    client.panel.listCategories({ storeSlug }),
    client.panel.listDepartments({ storeSlug }),
    client.panel.listTags({ storeSlug }),
  ]);

  return (
    <section aria-labelledby="product-new-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="product-new-heading" className="text-xl font-semibold tracking-tight">
          Novo produto
        </h2>
        <p className="text-sm text-muted-foreground">
          Cadastre o produto, as variações e os preços.
        </p>
      </div>
      <ProductForm
        storeSlug={storeSlug}
        categories={categories}
        departments={departments}
        tags={tags}
      />
    </section>
  );
}
