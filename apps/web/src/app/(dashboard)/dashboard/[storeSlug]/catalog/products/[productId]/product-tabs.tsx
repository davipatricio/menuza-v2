"use client";

/**
 * Produto / SEO tabs of the product editor. The tab lives in the URL as shallow
 * state, and both panels stay mounted, so switching tabs keeps unsaved input and
 * never hits the server. The guard wraps both forms so a dirty section blocks
 * leaving the page.
 */
import { parseAsStringLiteral, useQueryState } from "nuqs";
import type { PanelProductDetail, PanelSeo } from "@menuza/shared/tenant";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { SeoForm } from "../../../_components/seo-form.tsx";
import { ProductEditorGuard, PendingChangesStatus } from "../product-editor-guard.tsx";
import { ProductForm } from "../product-form.tsx";

const TABS = ["produto", "seo"] as const;

export function ProductTabs({
  storeSlug,
  product,
  seo,
  categories,
  departments,
  tags,
}: {
  storeSlug: string;
  product: PanelProductDetail;
  seo: PanelSeo;
  categories: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}) {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS)
      .withDefault("produto")
      .withOptions({ history: "replace", scroll: false }),
  );

  return (
    <ProductEditorGuard>
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <PendingChangesStatus />

        <Tabs value={tab} onValueChange={(next) => setTab(next === "seo" ? "seo" : "produto")}>
          <TabsList aria-label="Seções do produto">
            <TabsTrigger value="produto">Produto</TabsTrigger>
            <TabsTrigger value="seo">SEO</TabsTrigger>
          </TabsList>

          <TabsContent value="produto" keepMounted>
            <ProductForm
              storeSlug={storeSlug}
              product={product}
              categories={categories}
              departments={departments}
              tags={tags}
            />
          </TabsContent>

          <TabsContent value="seo" keepMounted>
            <SeoForm
              storeSlug={storeSlug}
              entityType="product"
              entityId={product.id}
              entityName={product.name}
              initialData={seo}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ProductEditorGuard>
  );
}
