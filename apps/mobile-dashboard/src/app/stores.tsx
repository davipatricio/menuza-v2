import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/pressable.tsx";
import { useSession } from "@/lib/session.tsx";

/** The stores this member may open. A single-membership account never sees it. */
export default function StorePickerRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member, memberships, storeSlug, selectStore, signOut } = useSession();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 32,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 20,
      }}
    >
      <View className="gap-6">
        <View className="gap-1.5">
          <Text className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {member?.email ?? "Sessão"}
          </Text>
          <Text className="text-2xl font-bold tracking-tight text-foreground">Escolha a loja</Text>
          <Text className="text-sm text-muted-foreground">
            Selecione uma loja para gerenciar os pedidos e o catálogo.
          </Text>
        </View>

        <View className="gap-3">
          {memberships.map((membership) => {
            const active = membership.tenantSlug === storeSlug;

            return (
              <PressableScale
                accessibilityLabel={membership.tenantName}
                accessibilityRole="button"
                className={`flex-row items-center justify-between rounded-2xl border p-4 ${
                  active ? "border-primary bg-accent/60" : "border-border bg-card"
                }`}
                key={membership.tenantId}
                onPress={() => {
                  selectStore(membership.tenantSlug);
                  router.replace("/(tabs)/inicio");
                }}
              >
                <View className="flex-1 gap-1">
                  <Text className="text-base font-semibold text-card-foreground">
                    {membership.tenantName}
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <Text className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {membership.role}
                    </Text>
                  </View>
                </View>
                <Text className="text-lg font-medium text-muted-foreground/60 select-none">›</Text>
              </PressableScale>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center py-2 active:opacity-70"
          onPress={() => void signOut()}
        >
          <Text className="text-sm font-medium text-muted-foreground underline">Sair da conta</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
