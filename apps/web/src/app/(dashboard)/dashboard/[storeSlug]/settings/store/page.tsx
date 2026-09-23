import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { getStore } from "@/lib/mock-dashboard-data.ts";
import { SettingsSection } from "../_components/settings-section.tsx";

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = getStore(storeSlug);

  if (!store) notFound();

  return (
    <SettingsSection
      headingId="settings-store-heading"
      title="Dados da loja"
      description={`Identificação de ${store.displayName} (dados demonstrativos).`}
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
    </SettingsSection>
  );
}
