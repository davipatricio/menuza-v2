/**
 * Rótulos pt-BR dos enums do contrato.
 *
 * O contrato e o banco guardam slugs ASCII estáveis (`pending`, `active`, …);
 * a tradução mora só aqui, na UI. Nenhum outro lugar escreve rótulo em pt-BR no
 * valor armazenado.
 */
import type {
  CouponStatus,
  DiscountType,
  MemberKind,
  OrderStatus,
  StockMode,
  TenantRole,
} from "@menuza/shared/tenant";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  ready: "Pronto",
  delivered: "Entregue",
  canceled: "Cancelado",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  ready_for_pickup: "Pronto para retirada",
  completed: "Concluído",
  refunded: "Reembolsado",
  expired: "Expirado",
};

export const ORDER_STATUS_VARIANTS: Record<OrderStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  awaiting_payment: "secondary",
  canceled: "destructive",
  expired: "destructive",
  refunded: "destructive",
  confirmed: "default",
  ready: "default",
  delivered: "default",
  paid: "default",
  ready_for_pickup: "default",
  completed: "default",
};

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  active: "Ativo",
  expired: "Expirado",
  disabled: "Desativado",
};

export const COUPON_STATUS_VARIANTS: Record<CouponStatus, "default" | "secondary" | "destructive"> =
  {
    active: "default",
    disabled: "secondary",
    expired: "destructive",
  };

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: "Porcentagem (%)",
  fixed: "Valor fixo (R$)",
};

export const ROLE_LABELS: Record<TenantRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  staff: "Atendimento",
};

/**
 * `Member.kind` distingue conta humana de conta de serviço (MEN-228). A conta de
 * serviço ainda não existe de fato, mas o rótulo entra agora para que a coluna
 * da equipe não precise de tratamento especial quando ela aparecer.
 */
export const MEMBER_KIND_LABELS: Record<MemberKind, string> = {
  human: "Pessoa",
  bot: "Conta de serviço",
};

export const STOCK_MODE_LABELS: Record<StockMode, string> = {
  controlled: "Controlado",
  unlimited: "Ilimitado",
};
