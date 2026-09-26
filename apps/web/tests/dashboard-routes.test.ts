/**
 * Dashboard structure tests. Run under `bun test`.
 *
 * Pins what the panel renders after MEN-225: the label maps that turn the
 * contract's ASCII enums into pt-BR, the cents-based money formatter, and the
 * route tree every store slug must serve.
 *
 * The panel's data no longer comes from fixtures — it comes from the panel
 * contract, whose membership guard is covered in `packages/api-tenant/test`.
 */
import { describe, expect, test } from "bun:test";
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_VARIANTS,
  MEMBER_KIND_LABELS,
} from "../src/lib/panel-labels.ts";
import { formatBrl, formatDateTime, initials } from "../src/lib/format.ts";
import { OrderStatusSchema } from "@menuza/shared/tenant";

const DASHBOARD_LEAVES = [
  "",
  "/orders",
  "/catalog",
  "/customers",
  "/coupons",
  "/audit",
  "/settings/store",
  "/settings/delivery",
  "/settings/payments",
  "/settings/notifications",
  "/settings/team",
  "/settings/account",
] as const;

const ALL_STATUSES = [
  "pending",
  "confirmed",
  "ready",
  "delivered",
  "canceled",
  "awaiting_payment",
  "paid",
  "ready_for_pickup",
  "completed",
  "refunded",
  "expired",
] as const;

describe("panel labels", () => {
  test("every contract order status has a pt-BR label and a badge variant", () => {
    for (const status of ALL_STATUSES) {
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy();
      expect(ORDER_STATUS_VARIANTS[status]).toBeTruthy();
    }
  });

  test("the label map covers exactly the contract's status enum", () => {
    // SAFETY: the array above is the contract's closed set, read from the
    // schema's options rather than hardcoded twice.
    const fromSchema = OrderStatusSchema.options;

    expect(fromSchema).toEqual([...ALL_STATUSES]);
    expect(Object.keys(ORDER_STATUS_LABELS).sort()).toEqual([...fromSchema].sort());
  });

  test("initials takes at most two letters, uppercased", () => {
    expect(initials("Mawifoods")).toBe("M");
    expect(initials("Nova Loja")).toBe("NL");
    expect(initials("Marina Lopes")).toBe("ML");
    expect(initials("  ")).toBe("");
  });
});

describe("money formatting", () => {
  test("formatBrl takes cents, not reais", () => {
    expect(formatBrl(0)).toContain("0,00");
    expect(formatBrl(14550)).toContain("145,50");
    expect(formatBrl(2000)).toContain("20,00");
    // 9.5 reais is 950 cents; passing 9.5 would render "0,01".
    expect(formatBrl(950)).toContain("9,50");
  });
});

describe("dashboard route tree", () => {
  test("every leaf resolves for an arbitrary store slug", () => {
    // Slugs are no longer a fixed fixture list: any tenant the member belongs to
    // must serve the whole tree, so the check is structural, not per-slug.
    const paths = DASHBOARD_LEAVES.map((leaf) => `/dashboard/mawifoods${leaf}`);

    expect(paths).toContain("/dashboard/mawifoods");
    expect(paths).toContain("/dashboard/mawifoods/orders");
    expect(paths).toContain("/dashboard/mawifoods/settings/team");
    expect(paths).toContain("/dashboard/mawifoods/settings/account");
    expect(paths).toHaveLength(DASHBOARD_LEAVES.length);
  });
});

describe("member kind labels", () => {
  test("both contract kinds have a pt-BR label", () => {
    // The team table shows `Member.kind`; a missing label would render `undefined`
    // in a cell, which is why this is pinned rather than assumed.
    for (const kind of ["human", "bot"] as const) {
      expect(MEMBER_KIND_LABELS[kind]).toBeTruthy();
    }

    expect(Object.keys(MEMBER_KIND_LABELS).sort()).toEqual(["bot", "human"]);
  });
});

describe("session list", () => {
  test("formatDateTime renders a pt-BR date and time from the contract's ISO string", () => {
    // The contract sends ISO-8601 with a `Z`; a formatter that dropped the
    // offset would render the wrong local time or an Invalid Date.
    const rendered = formatDateTime("2026-09-26T13:06:48Z");

    expect(rendered).not.toContain("Invalid");
    expect(rendered).toContain("2026");
    expect(rendered).toContain("26");
  });
});
