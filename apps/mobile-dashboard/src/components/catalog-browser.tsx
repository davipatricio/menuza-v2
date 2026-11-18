import type { PanelProductList } from "@menuza/api-client/model";
import { formatBrl } from "@menuza/shared/money";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ChipGroup, type ChipOption } from "@/components/form.tsx";
import { HeaderAction, ManagementList, ManagementRow } from "@/components/management.tsx";
import { usePanelProducts } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

/** Two views of the same list: everything the store sells, or what ran out. */
type CatalogFilter = "todos" | "indisponiveis";

const FILTER_OPTIONS: readonly ChipOption<CatalogFilter>[] = [
  { value: "todos", label: "Todos" },
  { value: "indisponiveis", label: "Indisponíveis" },
];

/** The price window: a single price or the variation range, as the web table shows. */
function priceLabel(product: PanelProductList): string {
  if (product.priceMinCents === null) return "Sem preço";

  const max = product.priceMaxCents;

  if (max === null || max === product.priceMinCents) return formatBrl(product.priceMinCents);

  return `${formatBrl(product.priceMinCents)} – ${formatBrl(max)}`;
}

/** A text button: it stays a 44px touch target in the header or under the filters. */
function ClearAction({ label, onPress }: { label: string; onPress: () => void }) {
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

/**
 * The catalog tab body: the store's products, narrowed on the device.
 *
 * The panel read returns the whole list once, so the search field and the
 * availability chips only filter it — typing never refetches, and a pull to
 * refresh keeps the operator's filter.
 */
export function CatalogBrowser() {
  const router = useRouter();
  const { storeSlug } = useSession();
  const query = usePanelProducts(storeSlug);

  const [filter, setFilter] = useState<CatalogFilter>("todos");
  const [search, setSearch] = useState("");

  const term = search.trim().toLocaleLowerCase("pt-BR");

  const visible = useMemo(
    () =>
      (query.data ?? []).filter((product) => {
        if (filter === "indisponiveis" && product.available) return false;

        return term === "" || product.name.toLocaleLowerCase("pt-BR").includes(term);
      }),
    [query.data, filter, term],
  );

  const storeEmpty = (query.data?.length ?? 0) === 0;
  const nothingMatched = !storeEmpty && visible.length === 0;
  const narrowed = filter !== "todos" || term !== "";

  function clearFilters() {
    setFilter("todos");
    setSearch("");
  }

  function createProduct() {
    router.push("/management/catalog/products/new");
  }

  return (
    <View className="flex-1">
      <View className="gap-3 px-4 pt-4 pb-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-2xl font-semibold text-foreground">Produtos</Text>
          <HeaderAction label="Novo produto" onPress={createProduct} />
        </View>

        <ChipGroup label="Mostrar" onChange={setFilter} options={FILTER_OPTIONS} value={filter} />

        <View className="flex-row items-center gap-2">
          <TextInput
            accessibilityLabel="Buscar por nome"
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-[44px] flex-1 rounded-xl border border-border bg-card px-3.5 py-2.5 text-base text-card-foreground"
            onChangeText={setSearch}
            placeholder="Buscar por nome"
            placeholderTextColorClassName="accent-muted-foreground"
            returnKeyType="search"
            value={search}
          />
          {search === "" ? null : <ClearAction label="Limpar" onPress={() => setSearch("")} />}
        </View>

        {narrowed ? <ClearAction label="Limpar filtros" onPress={clearFilters} /> : null}
      </View>

      <ManagementList
        data={visible}
        description="Toque em um produto para abrir os detalhes."
        emptyMessage={
          nothingMatched
            ? "Nenhum produto atende à busca e ao filtro. Use Limpar filtros para ver a lista inteira."
            : "Os produtos da loja aparecem aqui."
        }
        emptyTitle={nothingMatched ? "Nenhum produto encontrado" : "Nenhum produto"}
        error={query.error}
        isPending={query.isPending}
        isRefetching={query.isRefetching}
        keyExtractor={(product) => product.id}
        onRefresh={() => void query.refetch()}
        renderItem={(product) => (
          <ManagementRow
            meta={product.available ? undefined : "Esgotado"}
            onPress={() => router.push(`/management/catalog/products/${product.id}`)}
            subtitle={priceLabel(product)}
            title={product.name}
          />
        )}
      />
    </View>
  );
}
