import type { TenantRole } from "@menuza/api-client/model";
import { listPanelTeamMembers } from "@menuza/api-client/tenant";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { View } from "react-native";

import { ManagementList, ManagementRow } from "@/components/management.tsx";
import { useSession } from "@/lib/session.tsx";

const ROLE_LABELS: Record<TenantRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  staff: "Atendimento",
};

/** `2026-11-15T18:04:00.000Z` → `15/11/2026`, the row's joined date. */
function joinedDate(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export default function TeamSettingsRoute() {
  const { storeSlug } = useSession();

  const query = useQuery({
    queryKey: ["team", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelTeamMembers(storeSlug);

      if (response.status !== 200) throw new Error(`A equipe respondeu ${response.status}.`);

      return response.data.members;
    },
  });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Equipe" }} />
      <ManagementList
        description="Quem pode gerenciar a loja."
        data={query.data ?? []}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        onRefresh={() => void query.refetch()}
        keyExtractor={(member) => member.memberId}
        emptyTitle="Ninguém na equipe ainda"
        emptyMessage="Os membros da loja aparecem aqui."
        renderItem={(member) => (
          <ManagementRow
            title={member.name ?? member.email}
            subtitle={
              member.name
                ? `${ROLE_LABELS[member.role]} · ${member.email}`
                : ROLE_LABELS[member.role]
            }
            meta={`Entrou em ${joinedDate(member.joinedAt)}`}
          />
        )}
      />
    </View>
  );
}
