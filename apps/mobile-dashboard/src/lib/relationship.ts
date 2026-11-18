import type {
  CouponInput,
  CouponStatus,
  CouponWriteStatus,
  DiscountType,
  IntegrationStatus,
  PanelCouponSummary,
} from "@menuza/api-client/model";
import {
  createPanelCoupon,
  deletePanelCoupon,
  getPanelCouponDetail,
  getPanelCustomer,
  listPanelAuditLogs,
  listPanelCouponSummaries,
  listPanelCustomers,
  savePanelIntegration,
  setPanelCouponStatus,
  updatePanelCoupon,
} from "@menuza/api-client/tenant";
import { formatBrl } from "@menuza/shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * The relationship screens' reads — coupons, customers and the audit trail —
 * plus the labels and dates they share.
 *
 * Every read is bound to the session's store and stays disabled until one is
 * selected, exactly like the order board.
 */
export function useCouponSummaries(storeSlug: string | null) {
  return useQuery({
    queryKey: ["coupons", "list", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelCouponSummaries(storeSlug);

      if (response.status !== 200) throw new Error(`Os cupons responderam ${response.status}.`);

      return response.data.coupons;
    },
  });
}

/** One coupon with a page of its redemption history. */
export function useCouponDetail(storeSlug: string | null, couponId: string) {
  return useQuery({
    queryKey: ["coupons", "detail", storeSlug, couponId],
    enabled: Boolean(storeSlug && couponId),
    queryFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await getPanelCouponDetail(storeSlug, couponId);

      if (response.status !== 200) throw new Error(`O cupom respondeu ${response.status}.`);

      return response.data;
    },
  });
}

/** The server's coupon rules, said in pt-BR before the raw status reaches a form. */
function couponWriteMessage(status: number): string {
  if (status === 409) return "Já existe um cupom com esse código.";

  if (status === 403) return "Você não tem permissão para gerenciar cupons nesta loja.";

  if (status === 400) return "Revise os campos do cupom e tente novamente.";

  return `O cupom respondeu ${status}.`;
}

/** Creates a coupon; the edit payload replaces every field, so this one is complete too. */
export function useCreateCoupon(storeSlug: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CouponInput) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await createPanelCoupon(storeSlug, input);

      if (response.status !== 200) throw new Error(couponWriteMessage(response.status));

      return response.data.coupon;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
  });
}

/** Replaces one coupon with the form's payload; unchanged fields travel too. */
export function useUpdateCoupon(storeSlug: string | null, couponId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CouponInput) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await updatePanelCoupon(storeSlug, couponId, input);

      if (response.status !== 200) throw new Error(couponWriteMessage(response.status));

      return response.data.coupon;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
  });
}

/**
 * The detail's Ativar/Desativar switch. The API refuses `active` on a coupon
 * whose window already closed, so a 400 reads as the expiry rule, not as a
 * malformed field.
 */
export function useSetCouponStatus(storeSlug: string | null, couponId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (status: CouponWriteStatus) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await setPanelCouponStatus(storeSlug, couponId, { status });

      if (response.status === 400) {
        throw new Error(
          "Não foi possível ativar o cupom. Se a data de término já passou, ajuste a validade antes.",
        );
      }

      if (response.status === 403) {
        throw new Error("Você não tem permissão para mudar o status deste cupom.");
      }

      if (response.status !== 200) throw new Error(`O cupom respondeu ${response.status}.`);

      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
  });
}

/** Deletes a coupon; the answer says whether history archived it instead. */
export function useDeleteCoupon(storeSlug: string | null, couponId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await deletePanelCoupon(storeSlug, couponId);

      if (response.status === 403) {
        throw new Error("Você não tem permissão para excluir cupons nesta loja.");
      }

      if (response.status === 404) throw new Error("Este cupom não existe mais.");

      if (response.status !== 200) throw new Error(`O cupom respondeu ${response.status}.`);

      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["coupons"] });
    },
  });
}

/**
 * The integrations switch: a status-only save keeps the stored config, so the
 * app never has to carry credentials it cannot collect.
 */
export function useSaveIntegration(storeSlug: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { integrationId: string; status: IntegrationStatus }) => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await savePanelIntegration(storeSlug, input.integrationId, {
        integrationId: input.integrationId,
        status: input.status,
      });

      if (response.status === 403) {
        throw new Error("Você não tem permissão para alterar as integrações desta loja.");
      }

      if (response.status !== 200) {
        throw new Error(`A integração respondeu ${response.status}.`);
      }

      return response.data.integration;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integrations", storeSlug] });
    },
  });
}

export function useCustomers(storeSlug: string | null) {
  return useQuery({
    queryKey: ["customers", "list", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelCustomers(storeSlug);

      if (response.status !== 200) throw new Error(`Os clientes responderam ${response.status}.`);

      return response.data.customers;
    },
  });
}

/** One customer plus their orders, newest first. */
export function useCustomer(storeSlug: string | null, customerId: string) {
  return useQuery({
    queryKey: ["customers", "detail", storeSlug, customerId],
    enabled: Boolean(storeSlug && customerId),
    queryFn: async () => {
      if (!storeSlug) throw new Error("Nenhuma loja selecionada.");

      const response = await getPanelCustomer(storeSlug, customerId);

      if (response.status !== 200) throw new Error(`O cliente respondeu ${response.status}.`);

      return response.data;
    },
  });
}

export function useAuditLogs(storeSlug: string | null) {
  return useQuery({
    queryKey: ["audit", "list", storeSlug],
    enabled: Boolean(storeSlug),
    queryFn: async () => {
      if (!storeSlug) return [];

      const response = await listPanelAuditLogs(storeSlug);

      if (response.status !== 200) throw new Error(`A auditoria respondeu ${response.status}.`);

      return response.data.logs;
    },
  });
}

/** pt-BR names for the coupon status the panel reads; `expired` is derived. */
const COUPON_STATUS = {
  active: "Ativo",
  expired: "Expirado",
  disabled: "Desativado",
} satisfies Record<CouponStatus, string>;

const DISCOUNT_TYPE = {
  percentage: "Porcentagem",
  fixed: "Valor fixo",
} satisfies Record<DiscountType, string>;

export function couponStatusLabel(status: CouponStatus): string {
  return COUPON_STATUS[status];
}

/** `Porcentagem · 15%` or `Valor fixo · R$ 10,00`, plus the freight cut. */
export function couponDiscount(coupon: PanelCouponSummary): string {
  const base =
    coupon.discountType === "percentage"
      ? `${coupon.valuePercent ?? 0}%`
      : formatBrl(coupon.valueCents ?? 0);

  const freight =
    coupon.shippingDiscountPercent === null
      ? base
      : `${base} + frete ${coupon.shippingDiscountPercent}%`;

  return `${DISCOUNT_TYPE[coupon.discountType]} · ${freight}`;
}

/** The row's meta chip: how often it was used, or when it last was. */
export function couponRedemptionMeta(coupon: PanelCouponSummary): string {
  if (coupon.lastRedeemedAt) return formatStamp(coupon.lastRedeemedAt);

  return coupon.redemptionCount === 1 ? "1 resgate" : `${coupon.redemptionCount} resgates`;
}

/** `2026-11-15T18:04:00Z` → `15/11/2026 18:04`, the relationship stamp. */
export function formatStamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return iso;

  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;

  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
