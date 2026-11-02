import { createFileRoute, redirect } from "@tanstack/react-router";
import { CouponCreateForm } from "@/features/coupons/components/coupon-form.tsx";
import { listProductsFn } from "@/features/catalog/server/list-products.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/coupons/new")({
  loader: async ({ params }) => {
    const payload = await listProductsFn({ data: { storeSlug: params.storeSlug } });

    // No panel session: the layout already resolved the store, so the recovery
    // is signing in again, not a 404.
    if (!payload) throw redirect({ href: "/dashboard/login" });

    return { products: payload.products.map(({ id, name }) => ({ id, name })) };
  },
  head: () => ({ meta: [{ title: pageTitle("Novo cupom") }] }),
  component: NewCouponPage,
});

function NewCouponPage() {
  const { storeSlug } = Route.useParams();
  const { products } = Route.useLoaderData();

  return (
    <section aria-labelledby="coupon-new-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="coupon-new-heading" className="text-xl font-semibold tracking-tight">
          Novo cupom
        </h2>
        <p className="text-sm text-muted-foreground">
          Crie uma promoção com regras de uso, validade e limites.
        </p>
      </div>

      <CouponCreateForm storeSlug={storeSlug} products={products} />
    </section>
  );
}
