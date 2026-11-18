import "../../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useNotificationRouting } from "@/lib/notifications.ts";
import { QueryProvider } from "@/lib/query.tsx";
import { SessionProvider } from "@/lib/session.tsx";
import { ThemeModeProvider } from "@/lib/theme-mode.tsx";

/** Tapping a notification opens the order it names; mounted once, under the router. */
function NotificationRouter() {
  useNotificationRouting();

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeModeProvider>
          <QueryProvider>
            <SessionProvider>
              <NotificationRouter />
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: "slide_from_right",
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="stores" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="order/[code]"
                  options={{ headerShown: true, title: "Pedido" }}
                />
              </Stack>
              <StatusBar style="auto" />
            </SessionProvider>
          </QueryProvider>
        </ThemeModeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
