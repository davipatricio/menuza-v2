import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
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
import { buildProductTaxonomy, filterProducts, sortProducts } from "./product-filter.ts";
import { loadProductSearchParams } from "./product-search-params.ts";
import { ProductsTable } from "./products-table";

// Deliberately uncached: `router.refresh()` on a save clears only the current
// route's client cache, so a TTL here would show the user their own edit for at
// least 30s.
export const instant = true;

export default function CatalogProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<TableLoading label="Carregando produtos" />}>
      <CatalogProducts params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogProducts({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ storeSlug }, filters, client] = await Promise.all([
    params,
    loadProductSearchParams(searchParams),
    panelClient(),
  ]);

  if (!client) notFound();

  const { products } = await client.panel.listProducts({ storeSlug });

  const filtered = filterProducts(sortProducts(products), filters);
  const taxonomy = buildProductTaxonomy(products);

  return (
    <section aria-labelledby="products-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <h2 id="products-heading" className="text-xl font-semibold tracking-tight">
            Produtos
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerencie os produtos, os preços e a disponibilidade da loja.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <Link href={`/dashboard/${storeSlug}/catalog/products/new`} aria-label="Novo produto" />
          }
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          Novo produto
        </Button>
      </div>

      {products.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nenhum produto cadastrado</EmptyTitle>
            <EmptyDescription>
              Cadastre o primeiro produto para começar a montar o catálogo da loja.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/dashboard/${storeSlug}/catalog/products/new`}
                  aria-label="Criar primeiro produto"
                />
              }
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              Criar primeiro produto
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ProductsTable
          storeSlug={storeSlug}
          products={filtered}
          totalCount={products.length}
          taxonomy={taxonomy}
        />
      )}
    </section>
  );
}
