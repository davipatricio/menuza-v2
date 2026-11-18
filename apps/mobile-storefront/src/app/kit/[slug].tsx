import { getPublicKit } from "@menuza/api-client/commerce";
import type { PublicKit, PublicKitGroup, PublicKitItem } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, Loading } from "@/components/screen.tsx";

interface Group {
  id: string;
  name: string;
  min: number | null;
  max: number | null;
  items: PublicKitItem[];
}

/**
 * The kit's composition, read-only: each group, the dishes it holds and the
 * quantities the store locked. Pricing stays on the server; this screen never
 * recomputes a total the checkout would have to agree with.
 */
function groupsOf(kit: PublicKit): Group[] {
  const groups: Group[] = kit.groups.map((group: PublicKitGroup) => ({
    id: group.id,
    name: group.name,
    min: group.minItems,
    max: group.maxItems,
    items: kit.items.filter((item) => item.groupId === group.id),
  }));

  const known = new Set(groups.map((group) => group.id));
  const rest = kit.items.filter((item) => item.groupId === null || !known.has(item.groupId));

  if (rest.length > 0) {
    groups.push({ id: "outros", name: "Outros itens", min: null, max: null, items: rest });
  }

  return groups;
}

export default function KitScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const insets = useSafeAreaInsets();

  const query = useQuery({
    queryKey: ["kit", slug],
    queryFn: async () => {
      const response = await getPublicKit(slug);

      if (response.status !== 200) throw new Error(`O kit respondeu ${response.status}.`);

      return response.data.kit ?? null;
    },
    enabled: slug.length > 0,
  });

  if (query.isPending) return <Loading />;

  if (query.isError || !query.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <EmptyState
          title="Kit indisponível"
          message="Não foi possível carregar este kit. Volte ao cardápio e tente de novo."
        />
      </View>
    );
  }

  const kit = query.data;
  const hasExtra = kit.items.some((item) => item.chargeExtra);
  const percent = kit.percentOff && kit.percentOff > 0 ? Math.min(100, kit.percentOff) : 0;
  const baseCents = Math.max(0, kit.baseCents);
  const floorCents = baseCents - Math.floor((baseCents * percent) / 100);
  const priceLabel = hasExtra ? `a partir de ${formatBrl(floorCents)}` : formatBrl(floorCents);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <Image
        className="aspect-[4/3] w-full bg-muted"
        contentFit="cover"
        transition={120}
        cachePolicy="memory-disk"
        source={{ uri: kit.imageUrl }}
        accessibilityLabel={kit.name}
      />

      <View className="gap-5 p-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
            {kit.name}
          </Text>
          {kit.description ? (
            <Text className="text-sm text-muted-foreground">{kit.description}</Text>
          ) : null}
          <Text className="text-base font-medium text-foreground">{priceLabel}</Text>
          {kit.available ? null : (
            <Text className="text-sm text-muted-foreground">
              Indisponível no momento: o kit não alcança os mínimos com o estoque atual.
            </Text>
          )}
        </View>

        {kit.bands.length > 0 ? (
          <View className="gap-1 rounded-xl border border-border bg-accent p-3">
            <Text className="text-sm font-medium text-accent-foreground">
              Descontos por quantidade
            </Text>
            {kit.bands.map((band) => (
              <Text key={band.minQuantity} className="text-sm text-accent-foreground">
                {band.minQuantity}+ kits: {band.percent}% off
              </Text>
            ))}
          </View>
        ) : null}

        {groupsOf(kit).map((group) => (
          <View key={group.id} className="gap-2">
            <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
              {group.name}
            </Text>
            {group.min !== null || group.max !== null ? (
              <Text className="text-xs text-muted-foreground">
                {group.min !== null ? `Mínimo ${group.min}` : "Sem mínimo"}
                {group.max !== null ? ` · Máximo ${group.max}` : ""}
              </Text>
            ) : null}

            {group.items.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-3"
              >
                <View className="flex-1 gap-0.5">
                  <Text className="text-sm font-medium text-card-foreground">
                    {item.productName}
                  </Text>
                  <Text className="text-xs text-muted-foreground">{item.variationName}</Text>
                  {item.available ? null : (
                    <Text className="text-xs text-muted-foreground">Esgotado</Text>
                  )}
                </View>

                <View className="items-end gap-0.5">
                  <Text className="text-sm text-card-foreground">{formatBrl(item.priceCents)}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {item.quantity !== null ? `${item.quantity} no kit` : "você escolhe"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
