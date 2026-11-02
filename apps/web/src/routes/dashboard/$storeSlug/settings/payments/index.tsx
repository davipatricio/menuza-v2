import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { pageTitle } from "@/lib/seo/title.ts";

const settingsRoute = getRouteApi("/dashboard/$storeSlug/settings");

const METHODS = [
  { title: "Pix", hint: "Conta e chave ainda não configuradas." },
  { title: "Cartão", hint: "Adquirente ainda não configurada." },
  { title: "Dinheiro na entrega", hint: "Regras de troco ainda não configuradas." },
];

export const Route = createFileRoute("/dashboard/$storeSlug/settings/payments/")({
  head: () => ({ meta: [{ title: pageTitle("Pagamentos") }] }),
  component: PaymentsSettingsPage,
});

function PaymentsSettingsPage() {
  const { store } = settingsRoute.useLoaderData();

  return (
    <SettingsSection
      headingId="settings-payments-heading"
      title="Pagamentos"
      description={`Formas de pagamento de ${store.displayName}.`}
    >
      {METHODS.map((method) => (
        <Card key={method.title}>
          <CardHeader className="grid-cols-[1fr_auto] items-center">
            <CardTitle>{method.title}</CardTitle>
            <Badge variant="outline" className="text-muted-foreground">
              Em breve
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-pretty text-muted-foreground">{method.hint}</p>
          </CardContent>
        </Card>
      ))}
    </SettingsSection>
  );
}
