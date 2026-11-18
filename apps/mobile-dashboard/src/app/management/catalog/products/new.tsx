import type { CreateProductInput } from "@menuza/api-client/model";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import { ProductForm, type ProductFormValues } from "@/components/product-form.tsx";
import { useCreatePanelProduct, usePanelBadges, usePanelSubcategories } from "@/lib/catalog.ts";
import { useSession } from "@/lib/session.tsx";

/**
 * A new product. The API requires at least one variation, so the editor's
 * single price becomes the kit-less product's only variation, `Padrão`, with
 * no stock ceiling — the same shape the web editor starts a simple dish with.
 */
export default function NewProductRoute() {
  const { storeSlug } = useSession();
  const router = useRouter();
  const subcategories = usePanelSubcategories(storeSlug);
  const badges = usePanelBadges(storeSlug);
  const create = useCreatePanelProduct(storeSlug);

  useEffect(() => {
    if (create.isSuccess) router.back();
  }, [create.isSuccess, router]);

  function save(draft: ProductFormValues) {
    if (draft.priceCents === null) return;

    const input: CreateProductInput = {
      name: draft.name,
      description: draft.description === "" ? null : draft.description,
      subcategoryId: draft.subcategoryId,
      tagIds: [],
      badgeIds: draft.badgeIds,
      available: draft.available,
      archived: draft.archived,
      hidden: draft.hidden,
      private: draft.private,
      sortOrder: 0,
      variations: [
        {
          id: null,
          name: "Padrão",
          priceCents: draft.priceCents,
          stockMode: "unlimited",
          stockQty: null,
        },
      ],
    };

    create.mutate(input);
  }

  return (
    <ProductForm
      badges={badges.data ?? []}
      error={create.error?.message ?? null}
      onSubmit={save}
      saved={create.isSuccess}
      saving={create.isPending}
      subcategories={subcategories.data ?? []}
    />
  );
}
