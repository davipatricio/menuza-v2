import { getProduct } from "@menuza/api-client/commerce";
import type { PublicNutrition } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, Loading } from "@/components/screen.tsx";

/**
 * The direct-URL product: the label, the options with their own prices and, when
 * published, the nutrition summary. Read-only for now — the buyer checkout is a
 * server feature the web does not have either.
 */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [variationId, setVariationId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const response = await getProduct(id);

      if (response.status !== 200) throw new Error(`O produto respondeu ${response.status}.`);

      const product = response.data.product;

      if (!product) throw new Error("O produto não está publicado.");

      return product;
    },
    enabled: id.length > 0,
  });

  if (query.isPending) return <Loading />;

  if (query.isError) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <EmptyState
          title="Produto indisponível"
          message="Não foi possível carregar este item. Volte ao cardápio e tente de novo."
        />
      </View>
    );
  }

  const product = query.data;
  const selected = product.variations.find((variation) => variation.id === variationId);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      {product.imageUrl ? (
        <Image
          className="aspect-[4/3] w-full bg-muted"
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          source={{ uri: product.imageUrl }}
          accessibilityLabel={product.name}
        />
      ) : null}

      <View className="gap-4 p-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
            {product.name}
          </Text>
          {product.description ? (
            <Text className="text-sm text-muted-foreground">{product.description}</Text>
          ) : null}
        </View>

        <View accessibilityLabel="Opções" accessibilityRole="radiogroup" className="gap-2">
          <Text className="text-sm font-medium text-foreground">Opções</Text>

          {product.variations.map((variation) => {
            const active = (selected?.id ?? product.variations.at(0)?.id) === variation.id;

            return (
              <Pressable
                key={variation.id}
                accessibilityLabel={`${variation.name}, ${formatBrl(variation.priceCents)}${variation.available ? "" : ", esgotado"}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: active, disabled: !variation.available }}
                className={
                  active
                    ? "flex-row items-center justify-between rounded-lg border border-primary bg-accent px-3 py-3"
                    : "flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-3"
                }
                disabled={!variation.available}
                onPress={() => {
                  setVariationId(variation.id);
                  void Haptics.selectionAsync();
                }}
              >
                <View className="gap-0.5">
                  <Text className="text-sm font-medium text-foreground">{variation.name}</Text>
                  {variation.available ? null : (
                    <Text className="text-xs text-muted-foreground">Esgotado</Text>
                  )}
                </View>
                <Text className="text-sm font-medium text-foreground">
                  {formatBrl(variation.priceCents)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {product.tags.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {product.tags.map((tag) => (
              <Text
                key={tag}
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
              >
                {tag}
              </Text>
            ))}
          </View>
        ) : null}

        {product.nutrition ? <NutritionCard nutrition={product.nutrition} /> : null}

        <Pressable
          accessibilityLabel="Compartilhar item"
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-lg border border-border bg-card px-4 py-3 active:opacity-80"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void Share.share({
              message: `${product.name} — ${formatBrl(selected?.priceCents ?? product.fromPriceCents)}`,
            });
          }}
        >
          <Text className="text-sm font-medium text-foreground">Compartilhar item</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function NutritionCard({ nutrition }: { nutrition: PublicNutrition }) {
  const rows: Array<[string, string]> = [];

  if (nutrition.energyKcal !== null) rows.push(["Energia", `${nutrition.energyKcal} kcal`]);

  if (nutrition.proteinMg !== null)
    rows.push(["Proteínas", `${(nutrition.proteinMg / 1000).toFixed(1)} g`]);

  if (nutrition.carbsMg !== null)
    rows.push(["Carboidratos", `${(nutrition.carbsMg / 1000).toFixed(1)} g`]);

  if (nutrition.totalFatMg !== null)
    rows.push(["Gorduras totais", `${(nutrition.totalFatMg / 1000).toFixed(1)} g`]);

  if (nutrition.sodiumMg !== null) rows.push(["Sódio", `${nutrition.sodiumMg} mg`]);

  if (rows.length === 0) return null;

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <Text className="text-sm font-semibold text-card-foreground">Informação nutricional</Text>
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">{label}</Text>
          <Text className="text-sm text-card-foreground">{value}</Text>
        </View>
      ))}
    </View>
  );
}
