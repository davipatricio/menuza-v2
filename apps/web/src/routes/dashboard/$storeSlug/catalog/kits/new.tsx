import { createFileRoute, redirect } from "@tanstack/react-router";
import { KitForm } from "@/features/catalog/components/kit-form.tsx";
import { listKitOptionsFn } from "@/features/catalog/server/kit-editor.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/catalog/kits/new")({
  loader: async ({ params }) => {
    const options = await listKitOptionsFn({ data: { storeSlug: params.storeSlug } });

    if (!options) throw redirect({ href: "/dashboard/login" });

    return { options: options.products };
  },
  head: () => ({ meta: [{ title: pageTitle("Novo kit") }] }),
  component: NewKitPage,
});

function NewKitPage() {
  const { options } = Route.useLoaderData();
  const { storeSlug } = Route.useParams();

  return (
    <section aria-labelledby="new-kit-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="new-kit-heading" className="text-xl font-semibold tracking-tight">
          Novo kit
        </h2>
        <p className="text-sm text-muted-foreground">
          Defina os pratos, o preço e as regras de composição.
        </p>
      </div>
      <KitForm storeSlug={storeSlug} options={options} />
    </section>
  );
}
