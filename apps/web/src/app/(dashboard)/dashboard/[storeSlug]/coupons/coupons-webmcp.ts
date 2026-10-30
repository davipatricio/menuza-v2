"use client";

/**
 * Read-only coupon tools for WebMCP and the in-app assistant. The rows are
 * already on the server-rendered page, so every tool answers from the prop the
 * component holds: nothing here fetches, and a tool can never widen what the
 * member is allowed to see.
 */
import { useMemo } from "react";
import * as v from "valibot";
import type { PanelCouponSummary } from "@menuza/shared/tenant";
import { useRegisterTools } from "@/hooks/use-tools.ts";
import type { JsonSchema, ToolDefinition } from "@/lib/tools/registry.ts";

const ListInputSchema = v.object({
  status: v.optional(v.picklist(["active", "expired", "disabled"])),
  search: v.optional(v.string()),
});

const DetailInputSchema = v.object({
  code: v.pipe(v.string(), v.minLength(1)),
});

const EMPTY_INPUT = {
  type: "object",
  properties: {},
  additionalProperties: false,
} satisfies JsonSchema;

const LIST_INPUT = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["active", "expired", "disabled"] },
    search: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const DETAIL_INPUT = {
  type: "object",
  properties: { code: { type: "string" } },
  required: ["code"],
  additionalProperties: false,
} satisfies JsonSchema;

function summarize(coupon: PanelCouponSummary) {
  return {
    id: coupon.id,
    code: coupon.code,
    status: coupon.effectiveStatus,
    discountType: coupon.discountType,
    valuePercent: coupon.valuePercent,
    valueCents: coupon.valueCents,
    shippingDiscountPercent: coupon.shippingDiscountPercent,
    redemptions: coupon.redemptionCount,
    uniqueCustomers: coupon.uniqueCustomers,
    discountCents: coupon.discountCents,
    usageLimit: coupon.usageLimit,
    perCustomerLimit: coupon.perCustomerLimit,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    lastRedeemedAt: coupon.lastRedeemedAt,
  };
}

/** One pass over the rows: status and text are both cheap enough to fold together. */
function matching(
  coupons: readonly PanelCouponSummary[],
  status: string | null,
  search: string,
): PanelCouponSummary[] {
  const needles = search === "" ? null : search;

  return coupons.filter((coupon) => {
    if (status !== null && coupon.effectiveStatus !== status) return false;

    return (
      needles === null ||
      `${coupon.code} ${coupon.description ?? ""}`.toLowerCase().includes(needles)
    );
  });
}

export function useCouponWebMcp(coupons: readonly PanelCouponSummary[]) {
  const tools = useMemo<ToolDefinition[]>(
    () => [
      {
        name: "coupon.list",
        description:
          "Lista os cupons da loja com resgates, desconto concedido e status efetivo. Aceita filtro de status e busca por código.",
        inputSchema: LIST_INPUT,
        execute: (input) => {
          const parsed = v.safeParse(ListInputSchema, input);

          if (!parsed.success) {
            return { ok: false, error: "Filtro de cupons com tipos inválidos." };
          }

          const { status, search } = parsed.output;

          return {
            ok: true,
            data: {
              coupons: matching(coupons, status ?? null, search?.toLowerCase() ?? "").map(
                summarize,
              ),
            },
          };
        },
      },
      {
        name: "coupon.detail",
        description:
          "Detalhe de um cupom pelo código: desconto, limites, janela de validade e totais de resgate.",
        inputSchema: DETAIL_INPUT,
        execute: (input) => {
          const parsed = v.safeParse(DetailInputSchema, input);

          if (!parsed.success) {
            return { ok: false, error: "Informe o código do cupom." };
          }

          const code = parsed.output.code.trim().toUpperCase();
          const coupon = coupons.find((row) => row.code === code);

          if (!coupon) {
            return { ok: false, error: `Cupom ${code} não encontrado nesta loja.` };
          }

          return { ok: true, data: summarize(coupon) };
        },
      },
      {
        name: "coupon.stats",
        description:
          "Totais da loja em cupons: quantos estão ativos, resgates, desconto concedido e desconto médio por resgate.",
        inputSchema: EMPTY_INPUT,
        execute: () => {
          const redemptions = coupons.reduce((sum, coupon) => sum + coupon.redemptionCount, 0);
          const discountCents = coupons.reduce((sum, coupon) => sum + coupon.discountCents, 0);

          return {
            ok: true,
            data: {
              coupons: coupons.length,
              active: coupons.filter((coupon) => coupon.effectiveStatus === "active").length,
              redemptions,
              discountCents,
              averageDiscountCents: redemptions === 0 ? 0 : Math.round(discountCents / redemptions),
            },
          };
        },
      },
    ],
    [coupons],
  );

  useRegisterTools(tools);
}
