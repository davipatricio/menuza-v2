/**
 * Types for the pure order lifecycle (MEN-93, MEN-95, MEN-96, MEN-92).
 *
 * Type-only: the modules here are browser-safe and never touch the DB, the
 * clock or the environment. The enums mirror `packages/db/prisma/contract.prisma`
 * (`financial_status`, `fulfilment_status`, `order_event_type`,
 * `wallet_transaction_kind`); the slugs are the single source and must stay
 * identical, character for character.
 *
 * Money is integer cents everywhere (ADR-0006).
 */
import type { CouponInput, PriceLineInput, PriceOrderResult } from "../pricing/types.ts";

export type FinancialStatus =
  | "pending"
  | "awaiting_payment"
  | "pending_on_delivery"
  | "paid"
  | "refunded"
  | "expired"
  | "canceled";

export type FulfilmentStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "canceled";

export type OrderEventType =
  | "financial_changed"
  | "fulfilment_changed"
  | "payment_recorded"
  | "refunded"
  | "cashback_credited"
  | "cashback_reversed"
  | "wallet_reserved"
  | "wallet_released"
  | "note";

export type WalletTransactionKind =
  | "cashback_credit"
  | "store_credit"
  | "reserve"
  | "reserve_release"
  | "spend"
  | "reversal"
  | "adjustment";

export type PaymentMethod =
  | "pix"
  | "credit"
  | "debit"
  | "meal_voucher"
  | "food_voucher"
  | "boleto"
  | "cash_on_delivery"
  | "card_on_delivery";

export type OrderAxis = "financial" | "fulfilment";

/**
 * The caller's capabilities, resolved by the API layer from the member's role.
 * The engine never reads a role itself: it only asks whether a capability is
 * present.
 */
export interface TransitionActor {
  memberId: string;
  capabilities: readonly string[];
}

export interface TransitionRequest {
  axis: OrderAxis;
  from: string;
  to: string;
  /** Required by the rules flagged `requiresReason`; ignored otherwise. */
  reason?: string | null;
}

export interface TransitionRule {
  axis: OrderAxis;
  from: string;
  to: string;
  capability: string;
  requiresReason: boolean;
  terminal: boolean;
}

export type TransitionResult =
  | { ok: true; rule: TransitionRule }
  | { ok: false; reason: "unknown_transition" | "forbidden" | "reason_required" };

export interface CreateOrderInput {
  lines: PriceLineInput[];
  shippingCents: number;
  walletRequestedCents: number;
  walletAvailableCents: number;
  cashbackPercent?: number;
  coupons: CouponInput[];
  paymentMethod: PaymentMethod | null;
  /**
   * How the money is expected to arrive. `gateway` (the default) means an
   * online integration will create the charge, so the order gets a payment
   * window. `manual` means the store reconciles the payment itself (an
   * `offline` integration): there is no instrument to expire, so the order
   * stays pending until the store records the receipt.
   *
   * Derived server-side from the store's method assignment — never from the
   * checkout caller.
   */
  paymentMode?: "gateway" | "manual";
  /** Injected clock: the result is deterministic on this value. */
  now: Date;
}

export interface CreateOrderResult extends PriceOrderResult {
  financialStatus: FinancialStatus;
  fulfilmentStatus: FulfilmentStatus;
  expiresAt: Date | null;
  events: Array<{
    type: OrderEventType;
    fromValue: string | null;
    toValue: string | null;
  }>;
}

export interface WalletEntry {
  kind: WalletTransactionKind;
  /** Signed: a credit is positive, a spend/reserve/reversal is negative. */
  amountCents: number;
  orderId: string | null;
  reason: string | null;
}

export interface WalletState {
  balanceCents: number;
  transactions: readonly WalletEntry[];
}

export type WalletOp =
  | { ok: true; balanceCents: number; entry: WalletEntry; shortfallCents: number }
  | { ok: false; reason: "insufficient_balance" | "invalid_amount" };
