import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { getStore } from "@/lib/mock-dashboard-data.ts";
import { SettingsSection } from "../_components/settings-section.tsx";

const METHODS = [
  { title: "Pix", hint: "Conta e chave ainda não configuradas." },
  { title: "Cartão", hint: "Adquirente ainda não configurada." },
  { title: "Dinheiro na entrega", hint: "Regras de troco ainda não configuradas." },
];

export default async function PaymentsSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = getStore(storeSlug);

  if (!store) notFound();

  return (
    <SettingsSection
      headingId="settings-payments-heading"
      title="Pagamentos"
      description={`Formas de pagamento de ${store.displayName} (dados demonstrativos).`}
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
