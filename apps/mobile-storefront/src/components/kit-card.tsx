import type { PublicKit } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { Image } from "expo-image";
import { Text, View } from "react-native";

import { PressableScale } from "@/components/pressable.tsx";

/** A kit as the menu lists it: cover, name and the charged base price. */
export function KitCard({ kit, onPress }: { kit: PublicKit; onPress: () => void }) {
  const hasExtra = kit.items.some((item) => item.chargeExtra);
  const percent = kit.percentOff && kit.percentOff > 0 ? Math.min(100, kit.percentOff) : 0;
  const baseCents = Math.max(0, kit.baseCents);
  const floorCents = baseCents - Math.floor((baseCents * percent) / 100);
  const price = hasExtra ? `a partir de ${formatBrl(floorCents)}` : formatBrl(floorCents);

  return (
    <PressableScale
      accessibilityLabel={`${kit.name}, ${price}${kit.available ? "" : ", indisponível"}`}
      className="flex-row gap-3.5 rounded-2xl border border-border bg-card p-3.5"
      onPress={onPress}
    >
      {kit.imageUrl ? (
        <Image
          accessibilityLabel={kit.name}
          cachePolicy="memory-disk"
          className="size-20 rounded-xl bg-muted"
          contentFit="cover"
          source={{ uri: kit.imageUrl }}
          transition={120}
        />
      ) : (
        <View
          accessible={false}
          className="size-20 items-center justify-center rounded-xl border border-border/50 bg-muted/50"
        >
          <Text className="text-xl text-muted-foreground/40 select-none">🍱</Text>
        </View>
      )}

      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-card-foreground">{kit.name}</Text>
        {kit.description ? (
          <Text className="text-sm leading-snug text-muted-foreground" numberOfLines={2}>
            {kit.description}
          </Text>
        ) : null}
        <View className="mt-auto flex-row items-center gap-2 pt-1">
          <Text className="text-sm font-bold text-foreground">{price}</Text>
          {kit.available ? null : (
            <View className="rounded-md border border-border/50 bg-muted px-2 py-0.5">
              <Text className="text-xs font-semibold text-muted-foreground">Indisponível</Text>
            </View>
          )}
        </View>
      </View>
    </PressableScale>
  );
}
