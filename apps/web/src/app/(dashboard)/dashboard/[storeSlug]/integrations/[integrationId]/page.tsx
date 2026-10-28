import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  findIntegration,
  type PanelIntegration,
  type PanelMcpSession,
} from "@menuza/shared/tenant";
import { formatDateTime } from "@/lib/format.ts";
import { panelClient } from "@/lib/server-tenant.ts";
import { requireStore } from "../../settings/_components/require-store.ts";
import { IntegrationStatusBadge } from "../_components/status-badge.tsx";
import { IntegrationLogoMark } from "../_components/integration-logo.tsx";
import { McpConnectBlock } from "./mcp-connect.tsx";
import { McpSessionsList } from "./sessions-list.tsx";
import { IntegrationSettingsForm } from "./settings-form.tsx";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ integrationId: string }>;
}): Promise<Metadata> {
  const { integrationId } = await params;
  const definition = findIntegration(integrationId);

  return { title: definition?.name ?? "Integração" };
}

/**
 * One integration.
 *
 * Order on the page is the order an admin acts in: the switch and status
 * first, then what to configure, then what to paste into a client, then the
 * connected sessions — and only after all that, what the integration is.
 */
export default async function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ storeSlug: string; integrationId: string }>;
}) {
  const { storeSlug, integrationId } = await params;
  const definition = findIntegration(integrationId);

  if (!definition) notFound();

  const store = await requireStore(storeSlug);
  const client = await panelClient();

  if (!client) notFound();

  const { integrations } = await client.panel.listIntegrations({ storeSlug });

  const state: PanelIntegration = integrations.find(
    (integration) => integration.integrationId === integrationId,
  ) ?? {
    integrationId,
    status: "disabled",
    config: {},
    enabledAt: null,
    updatedAt: null,
  };

  const isMcp = definition.capabilities.includes("connect");

  const sessions: PanelMcpSession[] = isMcp
    ? (await client.panel.listMcpSessions({ storeSlug })).sessions
    : [];

  const serverUrl = await publicMcpUrl();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/dashboard/${storeSlug}/integrations`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Integrações
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <IntegrationLogoMark integration={definition} />
          <h2 className="text-xl font-semibold tracking-tight">{definition.name}</h2>
          <IntegrationStatusBadge status={state.status} />
          {definition.mock ? (
            <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
              Demonstração
            </span>
          ) : null}
        </div>
        <p className="text-sm text-pretty text-muted-foreground">
          {store.displayName} · por {definition.author}
          {state.updatedAt ? <> · última alteração em {formatDateTime(state.updatedAt)}</> : null}
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
              initial={state.config}
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

      <Card>
        <CardHeader>
          <CardTitle>Sobre</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-pretty text-muted-foreground">{definition.description}</p>
          {definition.screenshots && definition.screenshots.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {definition.screenshots.map((src) => (
                <li key={src}>
                  <Image
                    src={src}
                    alt={`Captura de tela de ${definition.name}`}
                    width={640}
                    height={400}
                    className="h-auto w-full rounded-lg border border-border"
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Autor: {definition.author} · Integração do catálogo Menuza
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The public `/mcp` URL: same origin the member is browsing, so the snippet
 * never points at a loopback address.
 */
async function publicMcpUrl(): Promise<string> {
  const base = (process.env.WEB_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return `${base}/mcp`;
}
