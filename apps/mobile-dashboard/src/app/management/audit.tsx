import { Stack } from "expo-router";
import { View } from "react-native";

import { ManagementList, ManagementRow } from "@/components/management.tsx";
import { formatStamp, useAuditLogs } from "@/lib/relationship.ts";
import { useSession } from "@/lib/session.tsx";

/** The store's audit trail, newest first: who did what, to what and when. */
export default function AuditRoute() {
  const { storeSlug } = useSession();
  const logs = useAuditLogs(storeSlug);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Auditoria" }} />
      <ManagementList
        description="O que mudou no painel, quem mudou e quando."
        data={logs.data ?? []}
        error={logs.error}
        isPending={logs.isPending}
        isRefetching={logs.isRefetching}
        onRefresh={() => void logs.refetch()}
        keyExtractor={(log) => log.id}
        emptyTitle="Nenhum registro"
        emptyMessage="Quando alguém alterar algo no painel, o registro aparece aqui."
        renderItem={(log) => (
          <ManagementRow
            title={log.action}
            subtitle={`${log.actor} · ${log.target}`}
            meta={formatStamp(log.createdAt)}
          />
        )}
      />
    </View>
  );
}
