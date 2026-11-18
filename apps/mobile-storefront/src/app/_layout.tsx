import "../../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { QueryProvider } from "@/lib/query.tsx";
import { StoreProvider, useStorefront } from "@/lib/store.tsx";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <StoreProvider>
            <StoreStack />
          </StoreProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The shell reads the palette from the loaded store, so a themed store gets a
 * native header in its own colors instead of the system default.
 */
function StoreStack() {
  const { store } = useStorefront();
  const { theme } = store;

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.backgroundColor },
          headerTintColor: theme.foregroundColor,
          contentStyle: { backgroundColor: theme.backgroundColor },
          animation: "slide_from_right",
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: "Produto" }} />
        <Stack.Screen name="kit/[slug]" options={{ title: "Kit" }} />
      </Stack>
      <StatusBar style={theme.foregroundColor === "#faf8f5" ? "light" : "dark"} />
    </>
  );
}
