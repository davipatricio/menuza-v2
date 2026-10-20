import { describe, expect, test } from "bun:test";

import {
  adjust,
  applyEntry,
  balanceOf,
  creditCashback,
  reconcile,
  release,
  reserve,
  reversal,
  spend,
} from "./ledger.ts";
import type { WalletEntry, WalletState } from "../orders/types.ts";

function state(balanceCents = 0, transactions: WalletEntry[] = []): WalletState {
  return { balanceCents, transactions };
}

const ORDER = "order-1";

describe("ledger: amounts", () => {
  test("a zero amount is invalid and adds no entry", () => {
    const before = state(1000, []);

    expect(
      applyEntry(before, { kind: "store_credit", amountCents: 0, orderId: null, reason: null }),
    ).toEqual({ ok: false, reason: "invalid_amount" });
    expect(reserve(before, { orderId: ORDER, amountCents: 0 })).toEqual({
      ok: false,
      reason: "invalid_amount",
    });
    expect(release(before, { orderId: ORDER, amountCents: 0 })).toEqual({
      ok: false,
      reason: "invalid_amount",
    });
    expect(spend(before, { orderId: ORDER, amountCents: 0 })).toEqual({
      ok: false,
      reason: "invalid_amount",
    });
    expect(reversal(before, { orderId: ORDER, amountCents: 0 })).toEqual({
      ok: false,
      reason: "invalid_amount",
    });
    expect(creditCashback(before, { orderId: null, amountCents: 0 })).toEqual({
      ok: false,
      reason: "invalid_amount",
    });
  });

  test("a fractional amount is invalid", () => {
    expect(
      applyEntry(state(1000, []), {
        kind: "adjustment",
        amountCents: 10.5,
        orderId: null,
        reason: null,
      }),
    ).toEqual({ ok: false, reason: "invalid_amount" });
  });
});

describe("ledger: never negative", () => {
  test("a reserve larger than the balance is refused", () => {
    const before = state(500, []);

    expect(reserve(before, { orderId: ORDER, amountCents: 600 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
  });

  test("a spend larger than the balance is refused", () => {
    expect(spend(state(500, []), { orderId: ORDER, amountCents: 501 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
  });

  test("a balance can be drained to exactly zero", () => {
    const op = reserve(state(500, []), { orderId: ORDER, amountCents: 500 });

    expect(op).toMatchObject({ ok: true, balanceCents: 0 });
  });
});

describe("ledger: reserve and release", () => {
  test("a release cannot exceed the outstanding reserve of that order", () => {
    const reserved = reserve(state(2000, []), { orderId: ORDER, amountCents: 1000 });

    if (!reserved.ok) throw new Error("reserve failed");

    const after = state(reserved.balanceCents, [reserved.entry]);

    expect(release(after, { orderId: ORDER, amountCents: 1001 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
    expect(release(after, { orderId: ORDER, amountCents: 1000 })).toMatchObject({
      ok: true,
      balanceCents: 2000,
    });
  });

  test("the reserve is per order", () => {
    const first = reserve(state(2000, []), { orderId: "order-1", amountCents: 1000 });

    if (!first.ok) throw new Error("reserve failed");

    const after = state(first.balanceCents, [first.entry]);

    expect(release(after, { orderId: "order-2", amountCents: 100 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
  });

  test("releasing twice cannot give back more than was reserved", () => {
    const reserved = reserve(state(2000, []), { orderId: ORDER, amountCents: 1000 });

    if (!reserved.ok) throw new Error("reserve failed");

    const released = release(state(reserved.balanceCents, [reserved.entry]), {
      orderId: ORDER,
      amountCents: 600,
    });

    if (!released.ok) throw new Error("release failed");

    const after = state(released.balanceCents, [reserved.entry, released.entry]);

    expect(after.balanceCents).toBe(1600);
    expect(release(after, { orderId: ORDER, amountCents: 401 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
    expect(release(after, { orderId: ORDER, amountCents: 400 }).ok).toBe(true);
  });

  test("a spend settles the reserve of its order", () => {
    const reserved = reserve(state(2000, []), { orderId: ORDER, amountCents: 1000 });

    if (!reserved.ok) throw new Error("reserve failed");

    const spent = spend(state(reserved.balanceCents, [reserved.entry]), {
      orderId: ORDER,
      amountCents: 1000,
    });

    if (!spent.ok) throw new Error("spend failed");

    expect(spent.balanceCents).toBe(0);

    const after = state(spent.balanceCents, [reserved.entry, spent.entry]);

    expect(release(after, { orderId: ORDER, amountCents: 1 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
  });
});

describe("ledger: reversal", () => {
  test("is capped at the balance and reports the shortfall", () => {
    const op = reversal(state(300, []), { orderId: ORDER, amountCents: 500 });

    expect(op).toEqual({
      ok: true,
      balanceCents: 0,
      entry: { kind: "reversal", amountCents: -300, orderId: ORDER, reason: null },
      shortfallCents: 200,
    });
  });

  test("takes the whole amount when it fits", () => {
    const op = reversal(state(1000, []), { orderId: ORDER, amountCents: 500 });

    expect(op).toEqual({
      ok: true,
      balanceCents: 500,
      entry: { kind: "reversal", amountCents: -500, orderId: ORDER, reason: null },
      shortfallCents: 0,
    });
  });

  test("an empty wallet has nothing to claw back", () => {
    expect(reversal(state(0, []), { orderId: ORDER, amountCents: 500 })).toEqual({
      ok: false,
      reason: "insufficient_balance",
    });
  });
});

describe("ledger: signing", () => {
  test("credits are positive, debits negative", () => {
    const credited = creditCashback(state(0, []), { orderId: ORDER, amountCents: 400 });

    if (!credited.ok) throw new Error("credit failed");

    expect(credited.entry.amountCents).toBe(400);

    const debited = spend(state(credited.balanceCents, [credited.entry]), {
      orderId: ORDER,
      amountCents: 400,
    });

    if (!debited.ok) throw new Error("spend failed");

    expect(debited.entry.amountCents).toBe(-400);
  });

  test("adjustment keeps the sign the caller gave", () => {
    const op = adjust(state(100, []), { orderId: null, amountCents: -100, reason: "correction" });

    expect(op).toMatchObject({
      ok: true,
      balanceCents: 0,
      entry: { kind: "adjustment", amountCents: -100, reason: "correction" },
    });
  });
});

describe("ledger: reconciliation", () => {
  test("balanceOf equals the running total", () => {
    expect(
      balanceOf([
        { kind: "cashback_credit", amountCents: 500, orderId: null, reason: null },
        { kind: "reserve", amountCents: -200, orderId: ORDER, reason: null },
      ]),
    ).toBe(300);
  });

  test("reconcile is true after every op", () => {
    let wallet = state(0, []);

    const credited = creditCashback(wallet, { orderId: ORDER, amountCents: 1000 });

    if (!credited.ok) throw new Error("credit failed");
    wallet = { balanceCents: credited.balanceCents, transactions: [credited.entry] };
    expect(reconcile(wallet)).toBe(true);

    const reserved = reserve(wallet, { orderId: ORDER, amountCents: 400 });

    if (!reserved.ok) throw new Error("reserve failed");
    wallet = {
      balanceCents: reserved.balanceCents,
      transactions: [...wallet.transactions, reserved.entry],
    };
    expect(reconcile(wallet)).toBe(true);

    const released = release(wallet, { orderId: ORDER, amountCents: 100 });

    if (!released.ok) throw new Error("release failed");
    wallet = {
      balanceCents: released.balanceCents,
      transactions: [...wallet.transactions, released.entry],
    };
    expect(reconcile(wallet)).toBe(true);

    const debited = spend(wallet, { orderId: ORDER, amountCents: 300 });

    if (!debited.ok) throw new Error("spend failed");
    wallet = {
      balanceCents: debited.balanceCents,
      transactions: [...wallet.transactions, debited.entry],
    };
    expect(reconcile(wallet)).toBe(true);

    const clawed = reversal(wallet, { orderId: ORDER, amountCents: 100 });

    if (!clawed.ok) throw new Error("reversal failed");
    wallet = {
      balanceCents: clawed.balanceCents,
      transactions: [...wallet.transactions, clawed.entry],
    };
    expect(reconcile(wallet)).toBe(true);

    expect(wallet.balanceCents).toBe(300);
  });

  test("reconcile is false when the stored balance drifted", () => {
    const wallet: WalletState = {
      balanceCents: 999,
      transactions: [{ kind: "cashback_credit", amountCents: 1000, orderId: null, reason: null }],
    };

    expect(reconcile(wallet)).toBe(false);
  });
});
