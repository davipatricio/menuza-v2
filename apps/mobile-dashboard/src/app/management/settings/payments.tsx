import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The payment methods the web lists as read-only until the feature ships. */
const METHODS = [
  { title: "Pix", hint: "Conta e chave ainda não configuradas." },
  { title: "Cartão", hint: "Adquirente ainda não configurada." },
  { title: "Dinheiro na entrega", hint: "Regras de troco ainda não configuradas." },
];

export default function PaymentsSettingsRoute() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <Stack.Screen options={{ title: "Pagamentos" }} />

      <View className="gap-3">
        <Text className="text-sm text-muted-foreground">Formas de pagamento da loja.</Text>

        {METHODS.map((method) => (
          <View key={method.title} className="gap-2 rounded-xl border border-border bg-card p-4">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-base font-semibold text-card-foreground">
                {method.title}
              </Text>
              <Text className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">
                Em breve
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">{method.hint}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
