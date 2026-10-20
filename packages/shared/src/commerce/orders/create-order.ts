/**
 * Checkout: turn a priced cart into an order row (MEN-96, MEN-92).
 *
 * Pure and deterministic on `input.now`. All money comes from `priceOrder` —
 * this module never re-derives a cent of it; it only picks the two status axes,
 * the payment expiry and the opening events.
 */
import { priceOrder } from "../pricing/price-order.ts";
import type {
  CreateOrderInput,
  CreateOrderResult,
  FinancialStatus,
  PaymentMethod,
} from "./types.ts";

const PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function createOrder(input: CreateOrderInput): CreateOrderResult {
  const priced = priceOrder(input);

  const financialStatus = initialFinancialStatus(input.paymentMethod);

  const expiresAt =
    financialStatus === "awaiting_payment"
      ? new Date(input.now.getTime() + PAYMENT_WINDOW_MS)
      : null;

  const events: CreateOrderResult["events"] = [
    { type: "financial_changed", fromValue: null, toValue: financialStatus },
    { type: "fulfilment_changed", fromValue: null, toValue: "pending" },
  ];

  if (priced.walletAppliedCents > 0) {
    events.push({ type: "wallet_reserved", fromValue: null, toValue: null });
  }

  return {
    ...priced,
    financialStatus,
    fulfilmentStatus: "pending",
    expiresAt,
    events,
  };
}

function initialFinancialStatus(paymentMethod: PaymentMethod | null): FinancialStatus {
  if (paymentMethod === null) return "pending";

  if (paymentMethod === "cash_on_delivery" || paymentMethod === "card_on_delivery") {
    return "pending_on_delivery";
  }

  return "awaiting_payment";
}
