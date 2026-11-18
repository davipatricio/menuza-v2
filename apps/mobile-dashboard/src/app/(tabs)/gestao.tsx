import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ManagementHub, type HubItem } from "@/components/management.tsx";
import { useSession } from "@/lib/session.tsx";

/**
 * The sections that do not deserve their own tab, in the web sidebar's order.
 *
 * Orders are the Pedidos tab, the products list is the Catálogo tab and the
 * overview is Início; everything else is here. Catálogo stays because kits and
 * the five taxonomy screens hang off it — dropping it would leave them
 * reachable by no route at all.
 */
const SECTIONS: HubItem[] = [
  {
    href: "/management/catalog",
    label: "Kits e taxonomia",
    description: "Kits, departamentos, categorias, subcategorias, tags e etiquetas.",
  },
  {
    href: "/management/coupons",
    label: "Cupons",
    description: "Códigos, descontos e histórico de resgates.",
  },
  {
    href: "/management/customers",
    label: "Clientes",
    description: "Quem já comprou na loja.",
  },
  {
    href: "/management/audit",
    label: "Auditoria",
    description: "O que mudou no painel e quem mudou.",
  },
  {
    href: "/management/integrations",
    label: "Integrações",
    description: "MCP, pagamentos e serviços conectados.",
  },
  {
    href: "/management/settings",
    label: "Configurações",
    description: "Loja, entrega, pagamentos, equipe e conta.",
  },
];

export default function MoreTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { member, memberships, storeSlug, signOut } = useSession();

  const store = memberships.find((membership) => membership.tenantSlug === storeSlug);

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="gap-1 px-4 pt-4 pb-3">
          <Text className="text-2xl font-bold tracking-tight text-foreground">Mais</Text>
          <Text className="text-sm text-muted-foreground">
            {store ? store.tenantName : "Loja selecionada"}
          </Text>
        </View>

        <View className="px-4">
          <ManagementHub items={SECTIONS} title="Gestão da loja" />
        </View>

        <View className="gap-3 px-4 pt-2">
          <Pressable
            accessibilityRole="button"
            className="min-h-[48px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3 active:opacity-80"
            onPress={() => router.push("/stores")}
          >
            <Text className="text-sm font-semibold text-foreground">Trocar de loja</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            className="min-h-[48px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3 active:opacity-80"
            onPress={() => {
              void signOut().then(() => router.replace("/"));
            }}
          >
            <Text className="text-sm font-semibold text-destructive">
              Sair{member?.email ? ` de ${member.email}` : ""}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
