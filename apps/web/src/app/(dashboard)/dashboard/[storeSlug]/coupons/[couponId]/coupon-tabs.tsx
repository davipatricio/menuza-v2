"use client";

/**
 * Desempenho / Resgates / Edição of one coupon. The tab is shallow URL state,
 * so switching never hits the server and the unsaved form keeps its input.
 */
import { parseAsStringLiteral, useQueryState } from "nuqs";
import type {
  PanelCouponRedemption,
  PanelCouponSummary,
  PanelCouponUsagePoint,
} from "@menuza/shared/tenant";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { CouponEditForm } from "../coupon-form.tsx";
import type { ProductOption } from "../coupon-product-picker.tsx";
import { CouponPerformance } from "./coupon-performance.tsx";
import { RedemptionsTable } from "./redemptions-table.tsx";

const TABS = ["edicao", "desempenho", "resgates"] as const;

export function CouponTabs({
  storeSlug,
  coupon,
  products,
  redemptions,
  totalRedemptions,
  usage,
  ordersWithCouponCents,
}: {
  storeSlug: string;
  coupon: PanelCouponSummary;
  products: ProductOption[];
  redemptions: PanelCouponRedemption[];
  totalRedemptions: number;
  usage: readonly PanelCouponUsagePoint[];
  ordersWithCouponCents: number;
}) {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TABS)
      .withDefault("edicao")
      .withOptions({ history: "replace", scroll: false }),
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        if (next === "desempenho" || next === "resgates" || next === "edicao") setTab(next);
      }}
      className="flex w-full flex-col gap-6"
    >
      <div className="-mt-1 -mb-2 w-full [scrollbar-width:none] overflow-x-auto overflow-y-hidden pt-1 pb-2 [&::-webkit-scrollbar]:hidden">
        <TabsList aria-label="Seções do cupom">
          <TabsTrigger value="edicao">Edição</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
          <TabsTrigger value="resgates">Resgates</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="edicao" keepMounted>
        <CouponEditForm storeSlug={storeSlug} coupon={coupon} products={products} />
      </TabsContent>

      <TabsContent value="desempenho">
        <CouponPerformance
          coupon={coupon}
          usage={usage}
          ordersWithCouponCents={ordersWithCouponCents}
        />
      </TabsContent>

      <TabsContent value="resgates" keepMounted>
        <RedemptionsTable
          storeSlug={storeSlug}
          redemptions={redemptions}
          totalRedemptions={totalRedemptions}
        />
      </TabsContent>
    </Tabs>
  );
}
