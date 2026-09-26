import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SettingsSection } from "../_components/settings-section.tsx";
import { requireStore } from "../_components/require-store.ts";

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await requireStore(storeSlug);

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
    </SettingsSection>
  );
}
