import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import type { SearchParams } from "nuqs/server";
import { CircleCheck } from "lucide-react";
import type { PanelProductDetail } from "@menuza/shared/tenant";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { DeleteProductButton } from "@/features/catalog/components/product-form.tsx";
import { ProductCrumb } from "@/features/catalog/components/product-crumb.tsx";
import { ProductTabs } from "@/features/catalog/components/product-tabs.tsx";
import { loadProductEditorFn } from "@/features/catalog/server/product-editor.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

/**
 * One bar, one state. Inactive wins because the product is gone from every
 * surface; then paused, then the visibility modifiers, then active.
 */
function productStatus(
  product: Pick<PanelProductDetail, "available" | "archived" | "hidden" | "private">,
) {
  if (!product.available) {
    return {
      label: "Inativo",
      description: "A URL direta responde 404 e o produto sai do cardápio.",
      bar: "bg-destructive",
    };
  }

  if (product.archived) {
    return {
      label: "Pausado",
      description: "A URL direta mostra o aviso de pausa, mas o produto não aparece no cardápio.",
      bar: "bg-warning",
    };
  }

  if (product.private && product.hidden) {
    return {
      label: "Oculto e privado",
      description: "Some do cardápio e exige uma conta da loja para abrir.",
      bar: "bg-muted-foreground",
    };
  }

  if (product.private) {
    return {
      label: "Privado",
      description: "Exige uma conta da loja para abrir e comprar.",
      bar: "bg-muted-foreground",
    };
  }

  if (product.hidden) {
    return {
      label: "Oculto",
      description: "Some do cardápio, da busca e do sitemap; a URL direta ainda abre.",
      bar: "bg-muted-foreground",
    };
  }

  return {
    label: "Ativo",
    description: "Visível no cardápio, na busca e no sitemap.",
    bar: "bg-success",
  };
}

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/products/$productId")({
  // SAFETY: raw query values, same as the list route — never parsed here, so no
  // canonicalising redirect. `?created=1` is the only key this page reads.
  validateSearch: (search) => search as SearchParams,
  loaderDeps: ({ search }) => ({ created: search.created === "1" }),
  loader: async ({ params, context, deps }) => {
    const data = await context.queryClient.ensureQueryData({
      queryKey: ["catalog", "product", params.storeSlug, params.productId],
      queryFn: () =>
        loadProductEditorFn({
          data: { storeSlug: params.storeSlug, productId: params.productId },
        }),
      // The product read used to be a 30s private cache entry; the query keeps
      // that window so tab switches and back navigation stay off the API.
      staleTime: 30_000,
    });

    // No panel session: the layout already resolved the store, so the recovery
    // is signing in again, not a 404.
    if (data.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    if (data.status === "not-found") throw notFound();

    return { created: deps.created, product: data.product, seo: data.seo, taxonomy: data.taxonomy };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: pageTitle(loaderData?.product.name ?? "Produto") }],
  }),
  component: EditProductPage,
});

function EditProductPage() {
  const { storeSlug } = Route.useParams();
  const { created, product, seo, taxonomy } = Route.useLoaderData();
  const status = productStatus(product);

  return (
    <ProductCrumb productId={product.id} name={product.name}>
      <section aria-labelledby="product-edit-heading" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              role="img"
              aria-label={`Status do produto: ${status.label}`}
              title={`${status.label}. ${status.description}`}
              className={`h-6 w-1 shrink-0 rounded-full ${status.bar}`}
            />
            <h2 id="product-edit-heading" className="min-w-0 text-xl font-semibold tracking-tight">
              {product.name}
            </h2>
          </div>
          <DeleteProductButton storeSlug={storeSlug} productId={product.id} />
        </div>

        {created ? (
          <Alert>
            <CircleCheck aria-hidden="true" />
            <AlertTitle>Produto criado</AlertTitle>
            <AlertDescription>
              Os dados foram salvos. Agora você pode editar o SEO.
            </AlertDescription>
          </Alert>
        ) : null}

        <ProductTabs
          storeSlug={storeSlug}
          product={product}
          seo={seo}
          subcategories={taxonomy.subcategories}
          tags={taxonomy.tags}
          badges={taxonomy.badges}
        />
      </section>
    </ProductCrumb>
  );
}
