import type { KitKind } from "@menuza/api-client/model";

/** pt-BR names for the two independent order axes. */
const FULFILMENT = {
  pending: "Novo",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  ready_for_pickup: "Aguardando retirada",
  out_for_delivery: "Em entrega",
  completed: "Concluído",
  canceled: "Cancelado",
} satisfies Record<string, string>;

const FINANCIAL = {
  pending: "Aguardando",
  awaiting_payment: "Aguardando pagamento",
  pending_on_delivery: "Paga na entrega",
  paid: "Pago",
  refunded: "Estornado",
  expired: "Expirado",
  canceled: "Cancelado",
} satisfies Record<string, string>;

function lookup(labels: Record<string, string>, status: string): string {
  return labels[status] ?? status;
}

/**
 * The three kit kinds, in the order the editor offers them. One list feeds the
 * chip group and the list row, so the two never drift.
 */
export const KIT_KIND_OPTIONS = [
  { value: "fixed", label: "Fixo" },
  { value: "custom_quantities", label: "Monte seu kit" },
  { value: "fixed_total", label: "Valor fixo" },
] satisfies readonly { value: KitKind; label: string }[];

export function kitKindLabel(kind: KitKind): string {
  return KIT_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

export function fulfilmentLabel(status: string): string {
  return lookup(FULFILMENT, status);
}

export function financialLabel(status: string): string {
  return lookup(FINANCIAL, status);
}

/** ``2026-11-15T18:04:00Z`` → ``15/11 18:04``, the board's compact stamp. */
export function orderStamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return iso;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}/${month} ${hours}:${minutes}`;
}
