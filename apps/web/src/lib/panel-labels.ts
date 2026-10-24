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
  FinancialStatus,
  FulfilmentStatus,
  MemberKind,
  NutritionBasis,
  NutritionLabelFormat,
  NutritionSource,
  PaymentMethod,
  StockMode,
  TenantRole,
} from "@menuza/shared/tenant";

export const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
  pending: "Pendente",
  awaiting_payment: "Aguardando pagamento",
  pending_on_delivery: "Pagamento na entrega",
  paid: "Pago",
  refunded: "Reembolsado",
  expired: "Expirado",
  canceled: "Cancelado",
};

export const FINANCIAL_STATUS_VARIANTS: Record<
  FinancialStatus,
  "default" | "secondary" | "destructive"
> = {
  pending: "secondary",
  awaiting_payment: "secondary",
  pending_on_delivery: "secondary",
  paid: "default",
  refunded: "destructive",
  expired: "destructive",
  canceled: "destructive",
};

export const FULFILMENT_STATUS_LABELS: Record<FulfilmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  ready_for_pickup: "Pronto para retirada",
  out_for_delivery: "Em entrega",
  completed: "Concluído",
  canceled: "Cancelado",
};

export const FULFILMENT_STATUS_VARIANTS: Record<
  FulfilmentStatus,
  "default" | "secondary" | "destructive"
> = {
  pending: "secondary",
  confirmed: "default",
  preparing: "default",
  ready: "default",
  ready_for_pickup: "default",
  out_for_delivery: "default",
  completed: "default",
  canceled: "destructive",
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

/**
 * Tabela nutricional (RDC 429/2020 e IN 75/2020). A base decide se a tabela
 * vale por 100 g ou por 100 mL; o formato escolhe entre a tabela completa e a
 * simplificada, que omite os constituintes sem quantidade significativa.
 */
export const NUTRITION_BASIS_LABELS: Record<NutritionBasis, string> = {
  solid: "Sólido",
  liquid: "Líquido",
};

export const NUTRITION_LABEL_FORMAT_LABELS: Record<NutritionLabelFormat, string> = {
  vertical: "Vertical",
  simplified: "Simplificado",
};

/**
 * De onde vieram os valores da tabela. A norma aceita análise laboratorial,
 * rótulo do fornecedor e base de dados; a estimativa é a última opção e o texto
 * avisa que não é medida.
 */
export const NUTRITION_SOURCE_LABELS: Record<NutritionSource, string> = {
  manual: "Informado pela loja",
  lab: "Análise laboratorial",
  supplier_label: "Rótulo do fornecedor",
  database: "Base de dados",
  estimate: "Estimativa",
};

/**
 * `PaymentMethod` (MEN-93). `null` means checkout never recorded one, which the
 * order screens render as "não informado" rather than an empty cell.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  credit: "Crédito",
  debit: "Débito",
  meal_voucher: "Vale-refeição",
  food_voucher: "Vale-alimentação",
  cash_on_delivery: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
};

/**
 * The order event trail (MEN-93). `OrderEvent.type` is stored as a stable ASCII
 * slug, but the catalog itself stays open until MEN-74, so the lookup goes
 * through `orderLabel` and an unknown event renders as its own slug.
 */
export const ORDER_EVENT_LABELS = {
  financial_changed: "Financeiro",
  fulfilment_changed: "Preparo",
  payment_recorded: "Pagamento registrado",
  refunded: "Reembolso",
  cashback_credited: "Cashback creditado",
  cashback_reversed: "Cashback estornado",
  wallet_reserved: "Carteira reservada",
  wallet_released: "Carteira liberada",
  note: "Anotação",
} satisfies Record<string, string>;

/**
 * pt-BR label for a stored slug, falling back to the slug itself. The two status
 * columns are closed sets, but a trail event or a transition target the map has
 * not learned yet must still render something readable instead of `undefined`.
 */
export function orderLabel<T extends Record<string, string>>(labels: T, key: string): string {
  if (!Object.hasOwn(labels, key)) return key;

  // SAFETY: `Object.hasOwn` just proved `key` is one of `labels`' own keys.
  return labels[key as keyof T] ?? key;
}

/**
 * The text of a transition button, keyed by the target slug on each axis. The
 * API decides which of these exist; this map only says what to call them.
 */
export const FINANCIAL_TRANSITION_LABELS: Record<FinancialStatus, string> = {
  pending: "Aguardar pagamento",
  awaiting_payment: "Aguardar pagamento",
  pending_on_delivery: "Pagamento na entrega",
  paid: "Marcar como pago",
  refunded: "Reembolsar",
  expired: "Expirar",
  canceled: "Cancelar pedido",
};

export const FULFILMENT_TRANSITION_LABELS: Record<FulfilmentStatus, string> = {
  pending: "Reabrir",
  confirmed: "Confirmar",
  preparing: "Iniciar preparo",
  ready: "Marcar como pronto",
  ready_for_pickup: "Pronto para retirada",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluir",
  canceled: "Cancelar preparo",
};
