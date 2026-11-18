import type { PanelProductDetail, PanelProductNutrition } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeaderAction, ManagementRow } from "@/components/management.tsx";
import { EmptyState, Loading } from "@/components/screen.tsx";
import { usePanelProduct } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

/** One product as the editor stores it: the read only, with no form. */
export default function ProductDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const query = usePanelProduct(storeSlug, id);

  if (query.isPending) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: "Produto" }} />
        <Loading />
      </View>
    );
  }

  if (query.isError || !query.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: "Produto" }} />
        <EmptyState
          title="Produto indisponível"
          message="Não foi possível carregar este produto."
        />
      </View>
    );
  }

  const product = query.data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <Stack.Screen
        options={{
          title: product.name,
          headerRight: () => (
            <HeaderAction
              label="Editar"
              onPress={() => router.push(`/management/catalog/products/${product.id}/edit`)}
            />
          ),
        }}
      />

      <View className="gap-5">
        <Summary product={product} />
        <Classification product={product} />
        {product.nutrition ? <Nutrition nutrition={product.nutrition} /> : null}
      </View>
    </ScrollView>
  );
}

function Summary({ product }: { product: PanelProductDetail }) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <Text className="text-xl font-semibold text-card-foreground">{product.name}</Text>
      <Text className="text-lg font-medium text-card-foreground">
        {product.priceCents === null ? "Preço não definido" : formatBrl(product.priceCents)}
      </Text>
      {product.description ? (
        <Text className="text-sm text-muted-foreground">{product.description}</Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2 pt-1">
        <Flag
          label={product.available ? "Disponível" : "Indisponível"}
          positive={product.available}
        />
        <Flag label={product.hidden ? "Oculto" : "Visível"} positive={!product.hidden} />
        <Flag label={product.private ? "Privado" : "Público"} positive={!product.private} />
        <Flag label={product.archived ? "Arquivado" : "Ativo"} positive={!product.archived} />
      </View>
    </View>
  );
}

function Classification({ product }: { product: PanelProductDetail }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">Classificação</Text>
      <ManagementRow title="Categoria" subtitle={product.categoryName ?? "Sem categoria"} />
      <ManagementRow
        title="Subcategoria"
        subtitle={product.subcategoryName ?? "Sem subcategoria"}
      />
      <ManagementRow
        title="Departamentos"
        subtitle={
          product.departmentNames.length > 0
            ? product.departmentNames.join(" · ")
            : "Nenhum departamento"
        }
      />
      <ManagementRow
        title="Etiquetas"
        subtitle={
          product.badges.length > 0
            ? product.badges.map((badge) => badge.name).join(" · ")
            : "Nenhuma etiqueta"
        }
      />
    </View>
  );
}

function Flag({ label, positive }: { label: string; positive: boolean }) {
  return (
    <Text
      className={
        positive
          ? "rounded-lg bg-accent px-2 py-1 text-xs text-accent-foreground"
          : "rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground"
      }
    >
      {label}
    </Text>
  );
}

/** The label is stored at 100 g/mL; the card shows the same numbers the web reads. */
function Nutrition({ nutrition }: { nutrition: PanelProductNutrition }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-foreground">Tabela nutricional</Text>
      <View className="gap-2 rounded-xl border border-border bg-card p-4">
        <Text className="text-xs text-muted-foreground">
          {nutrition.basis === "liquid" ? "Por 100 mL" : "Por 100 g"} ·{" "}
          {nutrition.published ? "Publicada" : "Não publicada"}
        </Text>
        <Nutrient
          label="Energia"
          value={nutrition.energyKcal === null ? "—" : `${nutrition.energyKcal} kcal`}
        />
        <Nutrient label="Carboidratos" value={grams(nutrition.carbsMg)} />
        <Nutrient label="Açúcares totais" value={grams(nutrition.totalSugarsMg)} />
        <Nutrient label="Proteínas" value={grams(nutrition.proteinMg)} />
        <Nutrient label="Gorduras totais" value={grams(nutrition.totalFatMg)} />
        <Nutrient label="Gorduras saturadas" value={grams(nutrition.saturatedFatMg)} />
        <Nutrient label="Fibras" value={grams(nutrition.fiberMg)} />
        <Nutrient
          label="Sódio"
          value={nutrition.sodiumMg === null ? "—" : `${nutrition.sodiumMg} mg`}
        />
      </View>
    </View>
  );
}

function Nutrient({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-sm text-card-foreground">{value}</Text>
    </View>
  );
}

/** Milligrams as grams with one decimal, the unit the label itself uses. */
function grams(mg: number | null): string {
  if (mg === null) return "—";

  return `${String(Math.round(mg / 100) / 10).replace(".", ",")} g`;
}
