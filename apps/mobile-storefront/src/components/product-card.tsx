import type { PublicProduct } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { Image } from "expo-image";
import { Text, View } from "react-native";

import { PressableScale } from "@/components/pressable.tsx";

/**
 * The catalogue card, mirroring the web one: image, name, short description,
 * a "a partir de" price when the dish has options, and a disabled state that
 * keeps an unavailable dish visible instead of hiding it.
 */
export function ProductCard({ product, onPress }: { product: PublicProduct; onPress: () => void }) {
  const first = product.variations.at(0);

  const price =
    product.variations.length > 1
      ? `a partir de ${formatBrl(product.fromPriceCents)}`
      : formatBrl(first?.priceCents ?? product.fromPriceCents);

  return (
    <PressableScale
      accessibilityLabel={product.name}
      accessibilityState={{ disabled: !product.available }}
      className="flex-row gap-3.5 rounded-2xl border border-border bg-card p-3.5"
      disabled={!product.available}
      onPress={onPress}
    >
      {product.imageUrl ? (
        <Image
          accessibilityLabel={product.name}
          cachePolicy="memory-disk"
          className="size-20 rounded-xl bg-muted"
          contentFit="cover"
          source={{ uri: product.imageUrl }}
          transition={120}
        />
      ) : (
        <View className="size-20 items-center justify-center rounded-xl border border-border/50 bg-muted/50">
          <Text className="text-xl text-muted-foreground/40 select-none">🍽</Text>
        </View>
      )}

      <View className="flex-1 gap-1">
        <Text className="text-base font-semibold text-card-foreground">{product.name}</Text>
        {product.description ? (
          <Text className="text-sm leading-snug text-muted-foreground" numberOfLines={2}>
            {product.description}
          </Text>
        ) : null}

        <View className="mt-auto flex-row items-center gap-2 pt-1">
          <Text className="text-sm font-bold text-foreground">{price}</Text>
          {product.available ? null : (
            <View className="rounded-md border border-border/50 bg-muted px-2 py-0.5">
              <Text className="text-xs font-semibold text-muted-foreground">Esgotado</Text>
            </View>
          )}
        </View>
      </View>
    </PressableScale>
  );
}
