import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProductForm } from "@/features/catalog/components/product-form.tsx";
import { loadProductTaxonomyFn } from "@/features/catalog/server/taxonomy.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/products/new")({
  loader: async ({ params, context }) => {
    const taxonomy = await context.queryClient.ensureQueryData({
      queryKey: ["catalog", "taxonomy", params.storeSlug],
      queryFn: () => loadProductTaxonomyFn({ data: { storeSlug: params.storeSlug } }),
      // Options change rarely and never mid-form; 30s is the documented floor so
      // link prefetch and a back navigation stay off the API.
      staleTime: 30_000,
    });

    // No panel session: the layout already resolved the store, so the recovery
    // is signing in again, not a 404.
    if (!taxonomy) throw redirect({ href: "/dashboard/login" });

    return taxonomy;
  },
  head: () => ({ meta: [{ title: pageTitle("Novo produto") }] }),
  component: NewProductPage,
});

function NewProductPage() {
  const { storeSlug } = Route.useParams();
  const taxonomy = Route.useLoaderData();

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
        subcategories={taxonomy.subcategories}
        tags={taxonomy.tags}
        badges={taxonomy.badges}
      />
    </section>
  );
}
