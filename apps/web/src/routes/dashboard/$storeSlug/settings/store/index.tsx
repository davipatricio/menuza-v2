import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SeoSettingsForm } from "@/features/settings/components/seo-settings-form.tsx";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { ThemeSettingsForm } from "@/features/settings/components/theme-settings-form.tsx";
import { loadStoreSeoFn, loadStoreThemeFn } from "@/features/settings/server/settings.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

const settingsRoute = getRouteApi("/dashboard/$storeSlug/settings");

export const Route = createFileRoute("/dashboard/$storeSlug/settings/store/")({
  loader: async ({ params }) => {
    const [seo, theme] = await Promise.all([
      loadStoreSeoFn({ data: { storeSlug: params.storeSlug } }),
      loadStoreThemeFn({ data: { storeSlug: params.storeSlug } }),
    ]);

    if (seo.status === "unauthenticated" || theme.status === "unauthenticated")
      throw redirect({ href: "/dashboard/login" });

    if (seo.status === "not-found" || theme.status === "not-found") throw notFound();

    return { seo: seo.seo, coverage: seo.coverage, theme: theme.theme };
  },
  head: () => ({ meta: [{ title: pageTitle("Dados da loja") }] }),
  component: StoreSettingsPage,
});

function StoreSettingsPage() {
  const { store } = settingsRoute.useLoaderData();
  const { seo, coverage, theme } = Route.useLoaderData();

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

      <ThemeSettingsForm storeSlug={store.slug} initialData={theme} />

      <SeoSettingsForm
        storeSlug={store.slug}
        storeName={store.displayName}
        initialData={seo}
        coverage={coverage}
      />
    </SettingsSection>
  );
}
