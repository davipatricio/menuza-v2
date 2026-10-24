"use client";

/**
 * Produto / Tabela nutricional / SEO tabs of the product editor. The tab lives
 * in the URL as shallow state, and the editing panels stay mounted, so switching
 * tabs keeps unsaved input and never hits the server. The guard wraps every form
 * so a dirty section blocks leaving the page.
 */
import { parseAsStringLiteral, useQueryState } from "nuqs";
import type { PanelProductDetail, PanelSeo } from "@menuza/shared/tenant";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { SeoForm } from "../../../_components/seo-form.tsx";
import { ProductEditorGuard, PendingChangesStatus } from "../product-editor-guard.tsx";
import { ProductForm } from "../product-form.tsx";
import type { SubcategoryOption } from "../product-taxonomy-select.tsx";
import { ProductNutrition } from "./product-nutrition.tsx";
import { ProductPerformance } from "./product-performance.tsx";

const TABS = ["produto", "nutricao", "seo", "desempenho"] as const;

export function ProductTabs({
  storeSlug,
  product,
  seo,
  subcategories,
  tags,
}: {
  storeSlug: string;
  product: PanelProductDetail;
  seo: PanelSeo;
  subcategories: SubcategoryOption[];
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
      <div className="flex w-full flex-col gap-6">
        <PendingChangesStatus />

        <Tabs
          value={tab}
          onValueChange={(next) => {
            if (
              next === "produto" ||
              next === "nutricao" ||
              next === "seo" ||
              next === "desempenho"
            ) {
              setTab(next);
            }
          }}
        >
          {/*
            Quatro seções com rótulos longos: a barra rola em vez de empurrar a
            página. O scroll fica no wrapper, com espaço para o indicador; no
            próprio TabsList o `overflow-x-auto` também ligava um scroll vertical
            por causa dos 5px do indicador.
          */}
          <div className="-mt-1 -mb-2 w-full [scrollbar-width:none] overflow-x-auto overflow-y-hidden pt-1 pb-2 [&::-webkit-scrollbar]:hidden">
            <TabsList aria-label="Seções do produto">
              <TabsTrigger value="produto">Produto</TabsTrigger>
              <TabsTrigger value="nutricao">Tabela nutricional</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="produto" keepMounted>
            <ProductForm
              storeSlug={storeSlug}
              product={product}
              subcategories={subcategories}
              tags={tags}
            />
          </TabsContent>

          <TabsContent value="nutricao" keepMounted>
            <ProductNutrition
              storeSlug={storeSlug}
              productId={product.id}
              nutrition={product.nutrition}
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

          <TabsContent value="desempenho">
            <ProductPerformance productName={product.name} />
          </TabsContent>
        </Tabs>
      </div>
    </ProductEditorGuard>
  );
}
