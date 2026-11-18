import { Stack } from "expo-router";
import { ScrollView, View } from "react-native";

import { ManagementHub, type HubItem } from "@/components/management.tsx";

/** Every settings section the web dashboard exposes, in sidebar order. */
const SECTIONS: HubItem[] = [
  {
    href: "/management/settings/store",
    label: "Loja",
    description: "Cores e SEO da vitrine.",
  },
  {
    href: "/management/settings/delivery",
    label: "Entrega",
    description: "Área de entrega e retirada.",
  },
  {
    href: "/management/settings/payments",
    label: "Pagamentos",
    description: "Formas de pagamento aceitas pela loja.",
  },
  {
    href: "/management/settings/notifications",
    label: "Notificações",
    description: "Avisos de pedidos neste aplicativo.",
  },
  {
    href: "/management/settings/team",
    label: "Equipe",
    description: "Quem pode gerenciar a loja.",
  },
  {
    href: "/management/settings/account",
    label: "Conta",
    description: "Sua conta, as sessões abertas e a saída.",
  },
];

export default function SettingsHubRoute() {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: "Configurações" }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ManagementHub title="Loja, equipe e sua conta." items={SECTIONS} />
      </ScrollView>
    </View>
  );
}
