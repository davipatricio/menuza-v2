import type { IntegrationStatus, PanelIntegration } from "@menuza/api-client/model";
import { listPanelIntegrations, listPanelMcpSessions } from "@menuza/api-client/tenant";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Text, View } from "react-native";

import { SwitchRow } from "@/components/form.tsx";
import { ManagementList } from "@/components/management.tsx";
import { formatStamp, useSaveIntegration } from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  enabled: "Ativado",
  disabled: "Desativado",
  paused: "Pausado",
  error: "Erro",
};

/** `2026-11-15T18:04:00.000Z` → `15/11/2026`, the enabled mark. */
function enabledDate(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

/**
 * The integration catalog with the one write the app owns: the on/off switch.
 *
 * The settings form needs credentials this app cannot collect, so it stays on
 * the web panel. A status-only save keeps the stored config untouched.
 */
export default function IntegrationsRoute() {
  const { storeSlug } = useSession();

  const query = useQuery({
    queryKey: ["integrations", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelIntegrations(storeSlug);

      if (response.status !== 200)
        throw new Error(`As integrações responderam ${response.status}.`);

      return response.data.integrations;
    },
  });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Integrações" }} />
      <ManagementList
        description="MCP, pagamentos e serviços conectados à loja."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(integration) => integration.integrationId}
        emptyTitle="Nenhuma integração"
        emptyMessage="As integrações disponíveis para a loja aparecem aqui."
        renderItem={(integration) => <IntegrationRow integration={integration} />}
      />
    </View>
  );
}

function IntegrationRow({ integration }: { integration: PanelIntegration }) {
  const { storeSlug } = useSession();
  const save = useSaveIntegration(storeSlug);

  const enabled = integration.status === "enabled";

  const since = integration.enabledAt
    ? ` · Ativado em ${enabledDate(integration.enabledAt)}`
    : " · Nunca ativado";

  function toggle(next: boolean) {
    if (save.isPending) return;

    save.mutate({
      integrationId: integration.integrationId,
      status: next ? "enabled" : "disabled",
    });
  }

  return (
    <View className="gap-2">
      <SwitchRow
        description={`${STATUS_LABELS[integration.status]}${since}`}
        label={integration.integrationId}
        onValueChange={toggle}
        value={enabled}
      />
      {save.error ? (
        <Text accessibilityRole="alert" className="px-1 text-xs text-destructive">
          {save.error.message}
        </Text>
      ) : null}
      {integration.integrationId === "mcp-dashboard" ? <McpSessions /> : null}
    </View>
  );
}

/** Who is connected to the dashboard MCP. Disabling the switch does not revoke them. */
function McpSessions() {
  const { storeSlug } = useSession();

  const query = useQuery({
    queryKey: ["integrations", "mcp-sessions", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelMcpSessions(storeSlug);

      if (response.status !== 200) throw new Error(`As sessões responderam ${response.status}.`);

      return response.data.sessions;
    },
  });

  const sessions = query.data ?? [];

  return (
    <View className="gap-1 rounded-xl border border-border bg-card p-3">
      <Text className="text-xs font-semibold text-card-foreground">Clientes MCP conectados</Text>
      {query.isPending ? (
        <Text className="text-xs text-muted-foreground">Carregando sessões…</Text>
      ) : query.isError ? (
        <Text className="text-xs text-muted-foreground">Não foi possível carregar as sessões.</Text>
      ) : sessions.length === 0 ? (
        <Text className="text-xs text-muted-foreground">Nenhum cliente conectado.</Text>
      ) : (
        sessions.map((session) => (
          <View key={session.id} className="gap-0.5 py-1">
            <Text className="text-sm font-medium text-card-foreground">{session.label}</Text>
            <Text className="text-xs text-muted-foreground">
              {session.memberName} · {session.clientName} · conectado em{" "}
              {formatStamp(session.createdAt)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
