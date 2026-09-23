import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { getStore } from "@/lib/mock-dashboard-data.ts";
import { SettingsSection } from "../_components/settings-section.tsx";

export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = getStore(storeSlug);

  if (!store) notFound();

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
