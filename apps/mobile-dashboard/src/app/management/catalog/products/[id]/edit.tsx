import type { UpdateProductInput } from "@menuza/api-client/model";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { ProductForm, type ProductFormValues } from "@/components/product-form.tsx";
import { EmptyState, Loading } from "@/components/screen.tsx";
import {
  usePanelBadges,
  usePanelProduct,
  usePanelSubcategories,
  useUpdatePanelProduct,
} from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

/**
 * The product editor. A partial update keeps every field this screen does not
 * own — tags, sort order and, for a multi-variation product, the variations.
 */
export default function EditProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storeSlug } = useSession();
  const router = useRouter();
  const query = usePanelProduct(storeSlug, id);
  const subcategories = usePanelSubcategories(storeSlug);
  const badges = usePanelBadges(storeSlug);
  const update = useUpdatePanelProduct(storeSlug);

  useEffect(() => {
    if (update.isSuccess) router.back();
  }, [update.isSuccess, router]);

  if (query.isPending) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: "Editar produto" }} />
        <Loading />
      </View>
    );
  }

  if (query.isError || !query.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: "Editar produto" }} />
        <EmptyState
          title="Produto indisponível"
          message="Não foi possível carregar este produto."
        />
      </View>
    );
  }

  const product = query.data;
  const single = product.variations.length <= 1 ? (product.variations.at(0) ?? null) : null;

  function save(draft: ProductFormValues) {
    const input: UpdateProductInput = {
      name: draft.name,
      description: draft.description === "" ? null : draft.description,
      subcategoryId: draft.subcategoryId,
      tagIds: null,
      badgeIds: draft.badgeIds,
      available: draft.available,
      archived: draft.archived,
      hidden: draft.hidden,
      private: draft.private,
      sortOrder: null,
      variations:
        draft.priceCents === null
          ? null
          : [
              {
                id: single?.id ?? null,
                name: single?.name ?? "Padrão",
                priceCents: draft.priceCents,
                stockMode: single?.stockMode ?? "unlimited",
                stockQty: single?.stockQty ?? null,
              },
            ],
    };

    update.mutate({ id: product.id, input });
  }

  return (
    <ProductForm
      badges={badges.data ?? []}
      error={update.error?.message ?? null}
      onSubmit={save}
      product={product}
      saved={update.isSuccess}
      saving={update.isPending}
      subcategories={subcategories.data ?? []}
    />
  );
}
