import { listMenu, listPublicKits } from "@menuza/api-client/commerce";
import type { PublicKit, PublicProduct } from "@menuza/api-client/model";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KitCard } from "@/components/kit-card.tsx";
import { ProductCard } from "@/components/product-card.tsx";
import { EmptyState, Loading, Page, PageHeader } from "@/components/screen.tsx";
import { useStorefront } from "@/lib/store.tsx";

type Row =
  | { key: string; kind: "department"; name: string }
  | { key: string; kind: "category"; name: string }
  | { key: string; kind: "subcategory"; name: string }
  | { key: string; kind: "product"; product: PublicProduct }
  | { key: string; kind: "kit"; kit: PublicKit };

/**
 * The whole published catalogue in one list: kits first, then department →
 * category → subcategory, exactly the tree the web menu renders. A flat row
 * model keeps a single virtualized list instead of nested ones.
 */
function buildRows(menu: Awaited<ReturnType<typeof loadMenu>>, kits: PublicKit[]): Row[] {
  const rows: Row[] = [];

  for (const kit of kits) rows.push({ key: `kit-${kit.id}`, kind: "kit", kit });

  for (const department of menu.departments) {
    rows.push({ key: `department-${department.id}`, kind: "department", name: department.name });

    for (const category of department.categories) {
      rows.push({
        key: `category-${department.id}-${category.id}`,
        kind: "category",
        name: category.name,
      });

      for (const subcategory of category.subcategories) {
        rows.push({
          key: `subcategory-${department.id}-${category.id}-${subcategory.id}`,
          kind: "subcategory",
          name: subcategory.name,
        });

        for (const product of subcategory.products) {
          rows.push({ key: `product-${product.id}`, kind: "product", product });
        }
      }
    }
  }

  if (menu.uncategorized.length > 0) {
    rows.push({ key: "category-uncategorized", kind: "category", name: "Outros" });

    for (const product of menu.uncategorized) {
      rows.push({ key: `product-${product.id}`, kind: "product", product });
    }
  }

  return rows;
}

async function loadMenu() {
  const response = await listMenu();

  if (response.status !== 200) throw new Error(`O cardápio respondeu ${response.status}.`);

  return response.data;
}

async function loadKits() {
  const response = await listPublicKits();

  if (response.status !== 200) throw new Error(`Os kits responderam ${response.status}.`);

  return response.data.kits;
}

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { store } = useStorefront();

  const menu = useQuery({ queryKey: ["menu"], queryFn: loadMenu });
  const kits = useQuery({ queryKey: ["kits"], queryFn: loadKits });

  const rows = useMemo(
    () => (menu.data ? buildRows(menu.data, kits.data ?? []) : []),
    [menu.data, kits.data],
  );

  if (menu.isPending) return <Loading />;

  return (
    <Page>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={menu.isRefetching}
            onRefresh={() => {
              void menu.refetch();
              void kits.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <PageHeader
            meta={store.displayName}
            title="Cardápio"
            subtitle="Itens publicados pela loja, com opções e preços."
          />
        }
        ListEmptyComponent={
          <View className="px-4">
            <EmptyState
              title="Nenhum item publicado"
              message="A loja ainda não publicou itens no cardápio. Volte mais tarde para conferir as opções."
            />
          </View>
        }
        renderItem={({ item }) => {
          switch (item.kind) {
            case "department":
              return (
                <Text
                  accessibilityRole="header"
                  className="px-4 pt-6 pb-2 text-xl font-semibold text-foreground"
                >
                  {item.name}
                </Text>
              );
            case "category":
              return (
                <Text
                  accessibilityRole="header"
                  className="px-4 pt-4 pb-2 text-lg font-medium text-foreground"
                >
                  {item.name}
                </Text>
              );
            case "subcategory":
              return (
                <Text
                  accessibilityRole="header"
                  className="px-4 pt-3 pb-2 text-sm font-medium text-muted-foreground"
                >
                  {item.name}
                </Text>
              );
            case "kit":
              return (
                <View className="px-4 pb-2">
                  <KitCard kit={item.kit} onPress={() => router.push(`/kit/${item.kit.slug}`)} />
                </View>
              );
            case "product":
              return (
                <View className="px-4 pb-2">
                  <ProductCard
                    product={item.product}
                    onPress={() => router.push(`/product/${item.product.id}`)}
                  />
                </View>
              );
          }
        }}
      />
    </Page>
  );
}
