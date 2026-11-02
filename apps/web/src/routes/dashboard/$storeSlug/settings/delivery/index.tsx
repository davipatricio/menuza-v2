import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

const settingsRoute = getRouteApi("/dashboard/$storeSlug/settings");

const SECTIONS = [
  { title: "Área de entrega", hint: "Bairros, raio e taxa ainda não configurados." },
  { title: "Retirada", hint: "Ponto e horário de retirada ainda não configurados." },
];

export const Route = createFileRoute("/dashboard/$storeSlug/settings/delivery/")({
  head: () => ({ meta: [{ title: pageTitle("Entrega e retirada") }] }),
  component: DeliverySettingsPage,
});

function DeliverySettingsPage() {
  const { store } = settingsRoute.useLoaderData();

  return (
    <SettingsSection
      headingId="settings-delivery-heading"
      title="Entrega e retirada"
      description={`Opções de entrega de ${store.displayName}.`}
    >
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader className="grid-cols-[1fr_auto] items-center">
            <CardTitle>{section.title}</CardTitle>
            <Badge variant="outline" className="text-muted-foreground">
              Em breve
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-pretty text-muted-foreground">{section.hint}</p>
          </CardContent>
        </Card>
      ))}
    </SettingsSection>
  );
}
