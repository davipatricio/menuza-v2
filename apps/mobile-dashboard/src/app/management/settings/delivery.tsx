import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The delivery options the web lists as read-only until the feature ships. */
const SECTIONS = [
  { title: "Área de entrega", hint: "Bairros, raio e taxa ainda não configurados." },
  { title: "Retirada", hint: "Ponto e horário de retirada ainda não configurados." },
];

export default function DeliverySettingsRoute() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <Stack.Screen options={{ title: "Entrega e retirada" }} />

      <View className="gap-3">
        <Text className="text-sm text-muted-foreground">Opções de entrega e retirada da loja.</Text>

        {SECTIONS.map((section) => (
          <View key={section.title} className="gap-2 rounded-xl border border-border bg-card p-4">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-base font-semibold text-card-foreground">
                {section.title}
              </Text>
              <Text className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">
                Em breve
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">{section.hint}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
