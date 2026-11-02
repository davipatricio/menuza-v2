import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { findIntegration } from "@menuza/shared/tenant";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { IntegrationAbout } from "@/features/integrations/components/integration-about.tsx";
import { IntegrationLogoMark } from "@/features/integrations/components/integration-logo.tsx";
import { IntegrationSettingsForm } from "@/features/integrations/components/integration-settings-form.tsx";
import { IntegrationStatusBadge } from "@/features/integrations/components/status-badge.tsx";
import { McpConnectBlock } from "@/features/integrations/components/mcp-connect.tsx";
import { McpSessionsList } from "@/features/integrations/components/mcp-sessions-list.tsx";
import { loadIntegrationFn } from "@/features/integrations/server/integrations.functions.ts";
import { formatDateTime } from "@/lib/format.ts";
import { pageTitle } from "@/lib/seo/title.ts";

export const Route = createFileRoute("/dashboard/$storeSlug/integrations/$integrationId")({
  loader: async ({ params }) => {
    const result = await loadIntegrationFn({
      data: { storeSlug: params.storeSlug, integrationId: params.integrationId },
    });

    if (result.status === "unauthenticated") throw redirect({ href: "/dashboard/login" });

    if (result.status === "not-found") throw notFound();

    return {
      integration: result.integration,
      sessions: result.sessions,
      serverUrl: result.serverUrl,
    };
  },
  head: ({ params }) => ({
    meta: [{ title: pageTitle(findIntegration(params.integrationId)?.name ?? "Integração") }],
  }),
  component: IntegrationDetailPage,
});

/**
 * One integration.
 *
 * Order on the page is the order an admin acts in: the switch and status first,
 * then what to configure, then what to paste into a client, then the connected
 * sessions — and only after all that, what the integration is.
 */
function IntegrationDetailPage() {
  const { storeSlug, integrationId } = Route.useParams();
  const { integration, sessions, serverUrl } = Route.useLoaderData();
  const definition = findIntegration(integrationId);

  if (!definition) throw notFound();

  const isMcp = definition.capabilities.includes("connect");

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/dashboard/$storeSlug/integrations"
        params={{ storeSlug }}
        preload="intent"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Integrações
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <IntegrationLogoMark integration={definition} />
          <h2 className="text-xl font-semibold tracking-tight">{definition.name}</h2>
          <IntegrationStatusBadge status={integration.status} />
          {definition.mock ? (
            <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
              Demonstração
            </span>
          ) : null}
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          Por {definition.author}
          {integration.updatedAt ? (
            <> · última alteração em {formatDateTime(integration.updatedAt)}</>
          ) : null}
        </p>
      </header>

      {definition.settings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Configurações</CardTitle>
            <CardDescription>
              {definition.mock
                ? "Estas opções ainda não têm efeito: a integração está no catálogo, sem implementação."
                : "Valem para esta loja. Outras lojas têm a própria configuração."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IntegrationSettingsForm
              storeSlug={storeSlug}
              integrationId={definition.id}
              settings={definition.settings}
              initial={integration.config}
              disabled={false}
            />
          </CardContent>
        </Card>
      ) : null}

      {isMcp ? (
        <Card>
          <CardHeader>
            <CardTitle>Conectar um cliente</CardTitle>
            <CardDescription>
              Cada conexão é uma sessão própria: seus colegas podem conectar os deles sem derrubar o
              seu.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <McpConnectBlock serverUrl={serverUrl} />

            <Separator />

            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Sessões conectadas</h3>
              <McpSessionsList storeSlug={storeSlug} sessions={sessions} canRevoke />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <IntegrationAbout definition={definition} />
    </div>
  );
}
