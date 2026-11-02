import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty.tsx";
import { SettingsSection } from "@/features/settings/components/settings-section.tsx";
import { TeamTable } from "@/features/settings/components/team-table.tsx";
import { loadTeamFn } from "@/features/settings/server/account.functions.ts";
import { pageTitle } from "@/lib/seo/title.ts";

const settingsRoute = getRouteApi("/dashboard/$storeSlug/settings");

export const Route = createFileRoute("/dashboard/$storeSlug/settings/team/")({
  loader: async ({ params }) => {
    const result = await loadTeamFn({ data: { storeSlug: params.storeSlug } });

    if (result.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    // `team:read` denied: the section still renders, as read-only.
    return { members: result.status === "ok" ? result.members : null };
  },
  head: () => ({ meta: [{ title: pageTitle("Equipe") }] }),
  component: TeamSettingsPage,
});

function TeamSettingsPage() {
  const { store } = settingsRoute.useLoaderData();
  const { members } = Route.useLoaderData();

  return (
    <SettingsSection
      headingId="settings-team-heading"
      title="Equipe"
      description={`Quem pode gerenciar ${store.displayName}.`}
    >
      {members === null ? (
        <Card>
          <CardHeader>
            <CardTitle>Sem permissão</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-pretty text-muted-foreground">
              Sua conta tem acesso de leitura a esta seção — cargos e permissões chegam com a matriz
              de permissões.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {members.length > 0 ? (
            <TeamTable storeSlug={store.slug} members={members} />
          ) : (
            <Empty className="border px-3 py-6">
              <EmptyHeader>
                <EmptyTitle>Ninguém na equipe ainda</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Convidar</CardTitle>
              <CardDescription>
                Convidar alguém depende de envio de e-mail, que ainda não faz parte do painel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-pretty text-muted-foreground">
                Por enquanto a equipe é somente leitura: ela vem do cadastro de cada loja.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </SettingsSection>
  );
}
