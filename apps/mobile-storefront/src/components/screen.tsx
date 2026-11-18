import type { ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** A full-height page that respects the notch and the home indicator. */
export function Page({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {children}
    </View>
  );
}

export function PageHeader({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <View className="gap-1 px-4 pt-4 pb-3">
      {meta ? (
        <Text className="text-xs tracking-wide text-muted-foreground uppercase">{meta}</Text>
      ) : null}
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {title}
      </Text>
      {subtitle ? <Text className="text-sm text-muted-foreground">{subtitle}</Text> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator accessibilityLabel="Carregando" />
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="items-center gap-2 rounded-xl border border-border bg-card px-6 py-10">
      <Text className="text-base font-semibold text-card-foreground">{title}</Text>
      <Text className="text-center text-sm text-muted-foreground">{message}</Text>
    </View>
  );
}
