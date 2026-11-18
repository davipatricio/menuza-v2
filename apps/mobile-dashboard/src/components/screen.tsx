import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function Page({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {children}
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" />
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="items-center gap-2.5 rounded-2xl border border-border bg-card px-6 py-12">
      <Text className="text-center text-base font-semibold text-card-foreground">{title}</Text>
      <Text className="text-center text-sm leading-relaxed text-muted-foreground">{message}</Text>
    </View>
  );
}

/** A failed read: the screen says what failed and offers a prominent, touch-friendly retry button. */
export function ErrorState({
  title = "Não foi possível carregar",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="items-center gap-3.5 rounded-2xl border border-border bg-card px-6 py-10">
      <Text className="text-center text-base font-semibold text-card-foreground">{title}</Text>
      <Text className="text-center text-sm leading-relaxed text-muted-foreground">{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center rounded-xl bg-primary px-5 py-2.5 active:opacity-80"
          hitSlop={8}
          onPress={onRetry}
        >
          <Text className="text-sm font-semibold text-primary-foreground">Tentar novamente</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
