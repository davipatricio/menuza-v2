/**
 * Wallet ledger (MEN-92).
 *
 * Pure arithmetic over an immutable list of entries: the balance is the running
 * total of `WalletTransaction.amountCents`, which is signed — a credit is
 * positive, a reserve/spend/reversal is negative. Nothing here reads the clock
 * or the database; the caller loads `transactions`, applies the entry and
 * persists both the row and the new `Wallet.balanceCents`.
 *
 * Invariants:
 * - the balance never goes below 0, so a `Wallet` never violates its CHECK;
 * - a release cannot give back more than is still reserved for that order, so a
 *   cancel + refund pair cannot mint credit;
 * - a spend settles the reserve of an order (reserved 1000 → spend 1000 leaves
 *   0 outstanding, so a later release cannot refund money already spent). Reserve
 *   and spend are alternatives for the same money: a flow that reserved must
 *   release before spending, otherwise the balance would be debited twice.
 *
 * `reconcile` is the drift check: the stored balance must equal the rollup.
 */
import type { WalletEntry, WalletOp, WalletState } from "../orders/types.ts";

export interface WalletOpInput {
  kind: WalletEntry["kind"];
  /** Signed cents as it will be stored. */
  amountCents: number;
  orderId: string | null;
  reason: string | null;
}

/** The single validation gate: every wrapper ends up here. */
export function applyEntry(state: WalletState, op: WalletOpInput): WalletOp {
  if (!Number.isSafeInteger(op.amountCents) || op.amountCents === 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  // Cashback clawback is the one kind that may exceed the balance: take what is
  // there and report the rest instead of failing the whole operation. Nothing to
  // take means nothing to write, so that stays a refusal.
  if (op.kind === "reversal" && state.balanceCents + op.amountCents < 0) {
    if (state.balanceCents === 0) return { ok: false, reason: "insufficient_balance" };

    const taken = state.balanceCents;

    return {
      ok: true,
      balanceCents: 0,
      entry: entryOf(op, -taken),
      shortfallCents: -op.amountCents - taken,
    };
  }

  if (state.balanceCents + op.amountCents < 0) {
    return { ok: false, reason: "insufficient_balance" };
  }

  return {
    ok: true,
    balanceCents: state.balanceCents + op.amountCents,
    entry: entryOf(op, op.amountCents),
    shortfallCents: 0,
  };
}

/** Holds `amountCents` of the balance for an order. */
export function reserve(
  state: WalletState,
  input: { orderId: string | null; amountCents: number; reason?: string | null },
): WalletOp {
  if (!positive(input.amountCents)) return { ok: false, reason: "invalid_amount" };

  return applyEntry(state, {
    kind: "reserve",
    amountCents: -input.amountCents,
    orderId: input.orderId,
    reason: input.reason ?? null,
  });
}

/** Gives back part or all of an order's outstanding reserve. */
export function release(
  state: WalletState,
  input: { orderId: string | null; amountCents: number; reason?: string | null },
): WalletOp {
  if (!positive(input.amountCents)) return { ok: false, reason: "invalid_amount" };

  if (input.amountCents > outstandingReserve(state, input.orderId)) {
    return { ok: false, reason: "insufficient_balance" };
  }

  return applyEntry(state, {
    kind: "reserve_release",
    amountCents: input.amountCents,
    orderId: input.orderId,
    reason: input.reason ?? null,
  });
}

/** Debits the balance for a paid order, settling the reserve it consumed. */
export function spend(
  state: WalletState,
  input: { orderId: string | null; amountCents: number; reason?: string | null },
): WalletOp {
  if (!positive(input.amountCents)) return { ok: false, reason: "invalid_amount" };

  return applyEntry(state, {
    kind: "spend",
    amountCents: -input.amountCents,
    orderId: input.orderId,
    reason: input.reason ?? null,
  });
}

/** Cashback clawback, capped at the available balance. */
export function reversal(
  state: WalletState,
  input: { orderId: string | null; amountCents: number; reason?: string | null },
): WalletOp {
  if (!positive(input.amountCents)) return { ok: false, reason: "invalid_amount" };

  return applyEntry(state, {
    kind: "reversal",
    amountCents: -input.amountCents,
    orderId: input.orderId,
    reason: input.reason ?? null,
  });
}

/** Operator correction; the sign is the caller's. */
export function adjust(
  state: WalletState,
  input: { orderId: string | null; amountCents: number; reason: string },
): WalletOp {
  return applyEntry(state, {
    kind: "adjustment",
    amountCents: input.amountCents,
    orderId: input.orderId,
    reason: input.reason,
  });
}

export function creditCashback(
  state: WalletState,
  input: { orderId: string | null; amountCents: number; reason?: string | null },
): WalletOp {
  if (!positive(input.amountCents)) return { ok: false, reason: "invalid_amount" };

  return applyEntry(state, {
    kind: "cashback_credit",
    amountCents: input.amountCents,
    orderId: input.orderId,
    reason: input.reason ?? null,
  });
}

export function balanceOf(transactions: readonly WalletEntry[]): number {
  return transactions.reduce((total, entry) => total + entry.amountCents, 0);
}

export function reconcile(state: WalletState): boolean {
  return balanceOf(state.transactions) === state.balanceCents;
}

/**
 * What is still held for `orderId`: reserved minus released minus spent, never
 * negative. A spend consumes the reserve of the same order.
 */
function outstandingReserve(state: WalletState, orderId: string | null): number {
  let reserved = 0;
  let released = 0;
  let spent = 0;

  for (const entry of state.transactions) {
    if (entry.orderId !== orderId) continue;

    if (entry.kind === "reserve") reserved += -entry.amountCents;
    else if (entry.kind === "reserve_release") released += entry.amountCents;
    else if (entry.kind === "spend") spent += -entry.amountCents;
  }

  return Math.max(0, reserved - released - spent);
}

function entryOf(op: WalletOpInput, amountCents: number): WalletEntry {
  return { kind: op.kind, amountCents, orderId: op.orderId, reason: op.reason };
}

function positive(amountCents: number): boolean {
  return Number.isSafeInteger(amountCents) && amountCents > 0;
}
