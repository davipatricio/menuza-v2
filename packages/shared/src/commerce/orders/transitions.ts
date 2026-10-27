/**
 * Order state machine (MEN-93, MEN-95).
 *
 * The legal (axis, from, to) tuples live in one table so the API layer, the
 * dashboard buttons and the tests all read the same source. `nextTransitions`
 * is what the dashboard renders; `applyTransition` is what the server enforces.
 *
 * Financial and fulfilment are independent axes: paying an order never moves
 * fulfilment, and a kitchen step never touches the money.
 *
 * Checks run in this order: unknown tuple → `unknown_transition`; missing
 * capability → `forbidden`; missing reason → `reason_required`. Permission is
 * checked before the reason so a caller who may not perform the transition
 * cannot probe the rule's requirements.
 */
import type {
  OrderAxis,
  TransitionActor,
  TransitionRequest,
  TransitionResult,
  TransitionRule,
} from "./types.ts";

const WRITE = "orders:write";

const REFUND = "orders:refund";

/** The states no transition leaves, per axis (`paid` is not one of them). */
const TERMINAL: Readonly<Record<OrderAxis, readonly string[]>> = {
  financial: ["refunded", "expired", "canceled"],
  fulfilment: ["completed", "canceled"],
};

export const TRANSITIONS: readonly TransitionRule[] = [
  // Financial. `paid` is the money landing, driven by `recordPayment`: no
  // reason, no capability beyond the write one. Money already taken leaves
  // through `refunded` only — there is no `paid → canceled`.
  rule("financial", "pending", "awaiting_payment", WRITE),
  rule("financial", "pending", "pending_on_delivery", WRITE),
  rule("financial", "pending", "canceled", WRITE, true),
  rule("financial", "awaiting_payment", "paid", WRITE),
  rule("financial", "awaiting_payment", "expired", WRITE),
  rule("financial", "awaiting_payment", "canceled", WRITE, true),
  rule("financial", "pending_on_delivery", "paid", WRITE),
  rule("financial", "pending_on_delivery", "canceled", WRITE, true),
  rule("financial", "paid", "refunded", REFUND, true),

  // Fulfilment. A kitchen cancellation must say why.
  rule("fulfilment", "pending", "confirmed", WRITE),
  rule("fulfilment", "confirmed", "preparing", WRITE),
  rule("fulfilment", "preparing", "ready", WRITE),
  rule("fulfilment", "ready", "ready_for_pickup", WRITE),
  rule("fulfilment", "ready", "out_for_delivery", WRITE),
  rule("fulfilment", "ready_for_pickup", "completed", WRITE),
  rule("fulfilment", "out_for_delivery", "completed", WRITE),
  rule("fulfilment", "pending", "canceled", WRITE, true),
  rule("fulfilment", "confirmed", "canceled", WRITE, true),
  rule("fulfilment", "preparing", "canceled", WRITE, true),
  rule("fulfilment", "ready", "canceled", WRITE, true),
];

export function applyTransition(
  request: TransitionRequest,
  actor: TransitionActor,
): TransitionResult {
  const match = TRANSITIONS.find(
    (candidate) =>
      candidate.axis === request.axis &&
      candidate.from === request.from &&
      candidate.to === request.to,
  );

  if (match === undefined) return { ok: false, reason: "unknown_transition" };

  if (!actor.capabilities.includes(match.capability)) {
    return { ok: false, reason: "forbidden" };
  }

  if (match.requiresReason && (request.reason ?? "").trim() === "") {
    return { ok: false, reason: "reason_required" };
  }

  return { ok: true, rule: match };
}

/** Every legal transition out of `from` that `actor` may perform. */
export function nextTransitions(
  axis: OrderAxis,
  from: string,
  actor: TransitionActor,
): TransitionRule[] {
  return TRANSITIONS.filter(
    (candidate) =>
      candidate.axis === axis &&
      candidate.from === from &&
      actor.capabilities.includes(candidate.capability),
  );
}

/**
 * Whether the order stops being fulfilled at this pair of axis values.
 *
 * The stock an order took goes back when it does: a cancelled order and an
 * expired one never reach the buyer. A completed or refunded one was
 * delivered, so its stock stays spent.
 *
 * The caller compares the pair before and after the transition and releases
 * the stock on the edge, which is what makes the release happen once.
 */
export function releasesStock(fulfilment: string, financial: string): boolean {
  return fulfilment === "canceled" || financial === "expired" || financial === "canceled";
}

function rule(
  axis: OrderAxis,
  from: string,
  to: string,
  capability: string,
  requiresReason = false,
): TransitionRule {
  return { axis, from, to, capability, requiresReason, terminal: TERMINAL[axis].includes(to) };
}
