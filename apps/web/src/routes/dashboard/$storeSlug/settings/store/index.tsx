import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SeoSettingsForm } from "@/features/settings/components/seo-settings-form.tsx";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { loadStoreSeoFn } from "@/features/settings/server/settings.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

const settingsRoute = getRouteApi("/dashboard/$storeSlug/settings");

export const Route = createFileRoute("/dashboard/$storeSlug/settings/store/")({
  loader: async ({ params }) => {
    const result = await loadStoreSeoFn({ data: { storeSlug: params.storeSlug } });

    if (result.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    if (result.status === "not-found") throw notFound();

    return { seo: result.seo };
  },
  head: () => ({ meta: [{ title: pageTitle("Dados da loja") }] }),
  component: StoreSettingsPage,
});

function StoreSettingsPage() {
  const { store } = settingsRoute.useLoaderData();
  const { seo } = Route.useLoaderData();

  return (
    <SettingsSection
      headingId="settings-store-heading"
      title="Dados da loja"
      description={`Identificação de ${store.displayName}.`}
    >
      <Card>
        <CardHeader>
          <CardTitle>Loja</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="font-medium">{store.displayName}</dd>
            <dt className="text-muted-foreground">Identificador</dt>
            <dd className="font-mono">{store.slug}</dd>
          </dl>
        </CardContent>
      </Card>

      <SeoSettingsForm storeSlug={store.slug} storeName={store.displayName} initialData={seo} />
    </SettingsSection>
  );
}
