import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { getStore } from "@/lib/mock-dashboard-data.ts";
import { SettingsSection } from "../_components/settings-section.tsx";

const SECTIONS = [
  { title: "Área de entrega", hint: "Bairros, raio e taxa ainda não configurados." },
  { title: "Retirada", hint: "Ponto e horário de retirada ainda não configurados." },
];

export default async function DeliverySettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = getStore(storeSlug);

  if (!store) notFound();

  return (
    <SettingsSection
      headingId="settings-delivery-heading"
      title="Entrega e retirada"
      description={`Opções de entrega de ${store.displayName} (dados demonstrativos).`}
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
