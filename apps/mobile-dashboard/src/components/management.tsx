import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import type { ReactElement } from "react";
import { Pressable, RefreshControl, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/pressable.tsx";
import { EmptyState, ErrorState } from "@/components/screen.tsx";

/**
 * The one list shape the management screens share.
 *
 * Orders, catalog and relationship screens all read one panel endpoint and
 * render rows; keeping the list here means a pull-to-refresh behaves the same
 * on every screen, one failed read reads the same everywhere, and no screen
 * grows its own empty state.
 */
export function ManagementList<T>({
  description,
  data,
  isPending,
  isRefetching,
  error,
  onRefresh,
  keyExtractor,
  renderItem,
  emptyTitle,
  emptyMessage,
}: {
  description?: string;
  data: readonly T[];
  isPending: boolean;
  isRefetching: boolean;
  error?: Error | null;
  onRefresh: () => void;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  emptyTitle: string;
  emptyMessage: string;
}) {
  const insets = useSafeAreaInsets();

  const failed = Boolean(error) && data.length === 0;

  return (
    <FlashList
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      data={data}
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      keyExtractor={keyExtractor}
      ListEmptyComponent={
        failed ? (
          <ErrorState message={error?.message ?? "Tente novamente."} onRetry={onRefresh} />
        ) : (
          <EmptyState
            message={isPending ? "Buscando os dados da loja." : emptyMessage}
            title={isPending ? "Carregando…" : emptyTitle}
          />
        )
      }
      ListHeaderComponent={
        description ? (
          <Text className="pb-3 text-sm text-muted-foreground">{description}</Text>
        ) : null
      }
      refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={isRefetching} />}
      renderItem={({ item }) => renderItem(item)}
    />
  );
}

/** One tappable row: a title, an optional second line and an optional meta tag with chevron. */
export function ManagementRow({
  title,
  subtitle,
  meta,
  onPress,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={title}
      className="min-h-[56px] justify-center gap-1.5 rounded-2xl border border-border bg-card p-4"
      onPress={onPress}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-base font-semibold text-card-foreground">{title}</Text>
        <View className="flex-row items-center gap-2">
          {meta ? (
            <Text className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              {meta}
            </Text>
          ) : null}
          {onPress ? (
            <Text className="text-lg font-medium text-muted-foreground/60 select-none">›</Text>
          ) : null}
        </View>
      </View>
      {subtitle ? (
        <Text className="text-sm leading-snug text-muted-foreground">{subtitle}</Text>
      ) : null}
    </PressableScale>
  );
}

/** The header button that opens a create editor, one per management list. Touch target ≥ 44px. */
export function HeaderAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[44px] justify-center px-2 active:opacity-70"
      hitSlop={8}
      onPress={onPress}
    >
      <Text className="text-sm font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}

export interface HubItem {
  href: string;
  label: string;
  description: string;
}

/** A short menu of sections, used by the management hubs. */
/**
 * A section index. It is a column of rows, not a screen: the caller owns the
 * page padding and the scroll, so a hub placed inside a `ScrollView` does not
 * claim `flex-1` and shrink to nothing.
 */
export function ManagementHub({ title, items }: { title: string; items: HubItem[] }) {
  const router = useRouter();

  return (
    <View className="gap-2.5">
      <Text className="pb-1 text-sm font-medium text-muted-foreground">{title}</Text>
      {items.map((item, index) => (
        <Animated.View entering={FadeInDown.delay(index * 25).duration(180)} key={item.href}>
          <ManagementRow
            onPress={() => router.push(item.href)}
            subtitle={item.description}
            title={item.label}
          />
        </Animated.View>
      ))}
    </View>
  );
}
