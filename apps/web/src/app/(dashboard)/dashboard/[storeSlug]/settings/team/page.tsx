import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SettingsSection } from "../_components/settings-section.tsx";
import { requireStore } from "../_components/require-store.ts";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await requireStore(storeSlug);

  return (
    <SettingsSection
      headingId="settings-team-heading"
      title="Equipe"
      description={`Quem pode gerenciar ${store.displayName}.`}
    >
      <Card>
        <CardHeader>
          <CardTitle>Sem permissão</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-pretty text-muted-foreground">
            A gestão de equipe exige o papel de proprietário. Sua conta tem acesso de leitura a esta
            seção — cargos e permissões chegam com a matriz de permissões.
          </p>
        </CardContent>
      </Card>
    </SettingsSection>
  );
}
