import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Push preferences exist on the web only: the native app has no subscription
 * flow yet, and the order board already sounds its own new-order alert. The
 * event list mirrors the web card without fake switches.
 */
const EVENTS = [
  "Novo pedido",
  "Pagamento confirmado",
  "Pix expirado",
  "Pedido pronto",
  "Cancelamento",
];

export default function NotificationsSettingsRoute() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <Stack.Screen options={{ title: "Notificações" }} />

      <View className="gap-3">
        <View className="gap-2 rounded-xl border border-border bg-card p-4">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-base font-semibold text-card-foreground">
              Notificações push
            </Text>
            <Text className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground">
              Em breve
            </Text>
          </View>
          <Text className="text-sm text-muted-foreground">
            Receba avisos dos pedidos em tempo real neste aplicativo. Enquanto isso, o quadro de
            pedidos continua tocando o alerta de pedidos novos.
          </Text>
        </View>

        <View className="gap-2 rounded-xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-card-foreground">Avisar sobre</Text>
          {EVENTS.map((event) => (
            <Text key={event} className="text-sm text-muted-foreground">
              {event}
            </Text>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
