import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PackageOpen, Plus } from "lucide-react";
import type { SearchParams } from "nuqs/server";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { TableLoading } from "@/features/catalog/components/table-loading.tsx";
import { ProductsTable } from "@/features/catalog/components/products-table.tsx";
import { buildProductTaxonomy, filterProducts } from "@/features/catalog/lib/product-filter.ts";
import { loadProductSearchParams } from "@/features/catalog/schemas/product-search.ts";
import { listProductsFn } from "@/features/catalog/server/list-products.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/products/")({
  // SAFETY: TanStack hands back the raw query values (string, or string[] for a
  // repeated key) — exactly nuqs' `SearchParams`. Passing them through untouched keeps
  // defaults out of the URL: parsing them here would make the router canonicalise the
  // search and 307 every plain visit. The loader is the only consumer and it parses.
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const filters = loadProductSearchParams(deps);

    const payload = await listProductsFn({
      data: { storeSlug: params.storeSlug, sort: filters.sort, order: filters.order },
    });

    // No panel session: the layout resolved the store, so signing in again recovers.
    if (!payload) throw redirect({ href: "/dashboard/login" });

    return {
      products: filterProducts(payload.products, filters),
      totalCount: payload.products.length,
      taxonomy: buildProductTaxonomy(payload.products),
    };
  },
  pendingComponent: () => <TableLoading label="Carregando produtos" />,
  head: () => ({ meta: [{ title: pageTitle("Produtos") }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { storeSlug } = Route.useParams();
  const { products, totalCount, taxonomy } = Route.useLoaderData();

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
            <Link
              to="/dashboard/$storeSlug/catalog/products/new"
              params={{ storeSlug }}
              aria-label="Novo produto"
            />
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
                  to="/dashboard/$storeSlug/catalog/products/new"
                  params={{ storeSlug }}
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
          products={products}
          totalCount={totalCount}
          taxonomy={taxonomy}
        />
      )}
    </section>
  );
}
