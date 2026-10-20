import { describe, expect, test } from "bun:test";

import { TRANSITIONS, applyTransition, nextTransitions } from "./transitions.ts";
import type {
  FinancialStatus,
  FulfilmentStatus,
  OrderAxis,
  TransitionActor,
  TransitionRule,
} from "./types.ts";

const WRITE_ONLY: TransitionActor = { memberId: "member-1", capabilities: ["orders:write"] };

const MANAGER: TransitionActor = {
  memberId: "member-2",
  capabilities: ["orders:write", "orders:refund"],
};

const FINANCIAL: readonly FinancialStatus[] = [
  "pending",
  "awaiting_payment",
  "pending_on_delivery",
  "paid",
  "refunded",
  "expired",
  "canceled",
];

const FULFILMENT: readonly FulfilmentStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "canceled",
];

const LEGAL: ReadonlyArray<[OrderAxis, string, string]> = TRANSITIONS.map((rule) => [
  rule.axis,
  rule.from,
  rule.to,
]);

const REASON = "customer asked";

function find(axis: OrderAxis, from: string, to: string): TransitionRule | undefined {
  return TRANSITIONS.find((rule) => rule.axis === axis && rule.from === from && rule.to === to);
}

describe("transitions: legal tuples", () => {
  test("the table has exactly the documented size", () => {
    expect(TRANSITIONS).toHaveLength(20);
    expect(TRANSITIONS.filter((rule) => rule.axis === "financial")).toHaveLength(9);
    expect(TRANSITIONS.filter((rule) => rule.axis === "fulfilment")).toHaveLength(11);
  });

  test("every legal tuple passes with the right capability", () => {
    for (const [axis, from, to] of LEGAL) {
      const rule = find(axis, from, to);
      expect(rule).toBeDefined();

      const actor: TransitionActor = {
        memberId: "member-3",
        capabilities: [rule!.capability],
      };

      const result = applyTransition({ axis, from, to, reason: REASON }, actor);

      expect(result).toEqual({ ok: true, rule: rule! });
    }
  });

  test("a missing capability is forbidden, not unknown", () => {
    const result = applyTransition(
      { axis: "financial", from: "paid", to: "refunded", reason: REASON },
      WRITE_ONLY,
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  test("a no-op capability fails every tuple", () => {
    const actor: TransitionActor = { memberId: "member-4", capabilities: [] };

    for (const [axis, from, to] of LEGAL) {
      expect(applyTransition({ axis, from, to, reason: REASON }, actor)).toEqual({
        ok: false,
        reason: "forbidden",
      });
    }
  });
});

describe("transitions: illegal tuples", () => {
  test("every pair not in the table is unknown_transition", () => {
    const axes: ReadonlyArray<[OrderAxis, readonly string[]]> = [
      ["financial", FINANCIAL],
      ["fulfilment", FULFILMENT],
    ];

    for (const [axis, states] of axes) {
      for (const from of states) {
        for (const to of states) {
          const legal = find(axis, from, to) !== undefined;
          const result = applyTransition({ axis, from, to, reason: REASON }, MANAGER);

          if (legal) expect(result.ok).toBe(true);
          else expect(result).toEqual({ ok: false, reason: "unknown_transition" });
        }
      }
    }
  });

  test("paid cannot be canceled — refund is the way out", () => {
    expect(applyTransition({ axis: "financial", from: "paid", to: "canceled" }, MANAGER)).toEqual({
      ok: false,
      reason: "unknown_transition",
    });
  });

  test("terminal states have no exit", () => {
    const terminals: ReadonlyArray<[OrderAxis, string, readonly string[]]> = [
      ["financial", "refunded", FINANCIAL],
      ["financial", "expired", FINANCIAL],
      ["financial", "canceled", FINANCIAL],
      ["fulfilment", "completed", FULFILMENT],
      ["fulfilment", "canceled", FULFILMENT],
    ];

    for (const [axis, from, targets] of terminals) {
      for (const to of targets) {
        expect(applyTransition({ axis, from, to, reason: REASON }, MANAGER)).toEqual({
          ok: false,
          reason: "unknown_transition",
        });
      }
    }
  });

  test("an axis is part of the tuple", () => {
    expect(
      applyTransition({ axis: "fulfilment", from: "pending", to: "awaiting_payment" }, MANAGER),
    ).toEqual({ ok: false, reason: "unknown_transition" });
  });
});

describe("transitions: reasons", () => {
  test("refunded requires a reason", () => {
    expect(applyTransition({ axis: "financial", from: "paid", to: "refunded" }, MANAGER)).toEqual({
      ok: false,
      reason: "reason_required",
    });

    expect(
      applyTransition({ axis: "financial", from: "paid", to: "refunded", reason: "   " }, MANAGER),
    ).toEqual({ ok: false, reason: "reason_required" });
  });

  test("every cancellation requires a reason, on both axes", () => {
    const cancellations = TRANSITIONS.filter((rule) => rule.to === "canceled");

    expect(cancellations).toHaveLength(7);
    expect(cancellations.filter((rule) => rule.axis === "financial")).toHaveLength(3);
    expect(cancellations.filter((rule) => rule.axis === "fulfilment")).toHaveLength(4);

    for (const rule of cancellations) {
      expect(rule.requiresReason).toBe(true);
      expect(
        applyTransition({ axis: rule.axis, from: rule.from, to: rule.to, reason: "" }, MANAGER),
      ).toEqual({ ok: false, reason: "reason_required" });
    }
  });

  test("a financial cancellation needs a reason too", () => {
    for (const from of ["pending", "awaiting_payment", "pending_on_delivery"] as const) {
      expect(applyTransition({ axis: "financial", from, to: "canceled" }, MANAGER)).toEqual({
        ok: false,
        reason: "reason_required",
      });

      expect(
        applyTransition({ axis: "financial", from, to: "canceled", reason: REASON }, MANAGER).ok,
      ).toBe(true);
    }
  });

  test("paid does not require a reason", () => {
    for (const from of ["awaiting_payment", "pending_on_delivery"] as const) {
      expect(applyTransition({ axis: "financial", from, to: "paid" }, MANAGER).ok).toBe(true);
    }
  });

  test("completed does not require a reason", () => {
    for (const from of ["ready_for_pickup", "out_for_delivery"] as const) {
      expect(applyTransition({ axis: "fulfilment", from, to: "completed" }, MANAGER).ok).toBe(true);
    }
  });

  test("forbidden wins over a missing reason", () => {
    expect(
      applyTransition({ axis: "financial", from: "paid", to: "refunded" }, WRITE_ONLY),
    ).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("nextTransitions", () => {
  test("returns only the transitions the actor may perform", () => {
    expect(nextTransitions("financial", "paid", WRITE_ONLY)).toEqual([]);

    expect(nextTransitions("financial", "paid", MANAGER).map((rule) => rule.to)).toEqual([
      "refunded",
    ]);
  });

  test("filters by axis and current state", () => {
    expect(nextTransitions("financial", "pending", WRITE_ONLY).map((rule) => rule.to)).toEqual([
      "awaiting_payment",
      "pending_on_delivery",
      "canceled",
    ]);

    expect(nextTransitions("fulfilment", "ready", WRITE_ONLY).map((rule) => rule.to)).toEqual([
      "ready_for_pickup",
      "out_for_delivery",
      "canceled",
    ]);
  });

  test("terminal states offer nothing", () => {
    expect(nextTransitions("fulfilment", "completed", MANAGER)).toEqual([]);
    expect(nextTransitions("financial", "expired", MANAGER)).toEqual([]);
  });
});
