import { notFound } from "next/navigation";
import { ORPCError } from "@orpc/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import type { TeamMember } from "@menuza/shared/tenant";
import { panelClient, type TenantClient } from "@/lib/server-tenant.ts";
import { SettingsSection } from "../_components/settings-section.tsx";
import { requireStore } from "../_components/require-store.ts";
import { EmptyState } from "../../_components/empty-state.tsx";
import { TeamTable } from "./team-table.tsx";

/**
 * The store's team, or `null` when the caller's role may not read it.
 *
 * `panel.listTeamMembers` is gated on `team:read`, so a `staff` member is
 * refused with FORBIDDEN. Anything else — no session, an unknown store, a
 * transport failure — propagates, because those are genuinely different
 * outcomes and swallowing them would render "no permission" for a 500.
 *
 * Kept out of the render so no JSX is built inside a `catch`.
 */
async function loadTeam(client: TenantClient, storeSlug: string): Promise<TeamMember[] | null> {
  try {
    const { members } = await client.panel.listTeamMembers({ storeSlug });

    return members;
  } catch (error) {
    if (error instanceof ORPCError && error.code === "FORBIDDEN") return null;

    throw error;
  }
}

/**
 * The store's team, read-only. Inviting a member needs email delivery, which is
 * its own ticket, so the section below the table says so rather than offering a
 * control that does nothing.
 */
export default async function TeamSettingsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await requireStore(storeSlug);
  const client = await panelClient();

  if (!client) notFound();

  const members = await loadTeam(client, storeSlug);

  if (members === null) {
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
              Sua conta tem acesso de leitura a esta seção — cargos e permissões chegam com a matriz
              de permissões.
            </p>
          </CardContent>
        </Card>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      headingId="settings-team-heading"
      title="Equipe"
      description={`Quem pode gerenciar ${store.displayName}.`}
    >
      <div className="flex flex-col gap-6">
        {members.length ? (
          <TeamTable members={members} storeSlug={store.slug} />
        ) : (
          <EmptyState>Ninguém na equipe ainda.</EmptyState>
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
    </SettingsSection>
  );
}
