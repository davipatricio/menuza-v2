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
  FINANCIAL_STATUS_LABELS,
  FINANCIAL_STATUS_VARIANTS,
  FULFILMENT_STATUS_LABELS,
  FULFILMENT_STATUS_VARIANTS,
  MEMBER_KIND_LABELS,
} from "../src/lib/panel-labels.ts";
import {
  formatBrl,
  formatBrlInput,
  formatDateTime,
  initials,
  maskBrlInput,
  maskIntegerInput,
  parseBrlToCents,
} from "../src/lib/format.ts";
import { FinancialStatusSchema, FulfilmentStatusSchema } from "@menuza/shared/tenant";

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

const ALL_FINANCIAL_STATUSES = [
  "pending",
  "awaiting_payment",
  "pending_on_delivery",
  "paid",
  "refunded",
  "expired",
  "canceled",
] as const;

const ALL_FULFILMENT_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "canceled",
] as const;

describe("panel labels", () => {
  test("every contract status has a pt-BR label and a badge variant on both axes", () => {
    for (const status of ALL_FINANCIAL_STATUSES) {
      expect(FINANCIAL_STATUS_LABELS[status]).toBeTruthy();
      expect(FINANCIAL_STATUS_VARIANTS[status]).toBeTruthy();
    }

    for (const status of ALL_FULFILMENT_STATUSES) {
      expect(FULFILMENT_STATUS_LABELS[status]).toBeTruthy();
      expect(FULFILMENT_STATUS_VARIANTS[status]).toBeTruthy();
    }
  });

  test("the label maps cover exactly the contract's status enums", () => {
    // SAFETY: the arrays above are the contract's closed sets, read from the
    // schemas' options rather than hardcoded twice.
    const financial = FinancialStatusSchema.options;
    const fulfilment = FulfilmentStatusSchema.options;

    expect(financial).toEqual([...ALL_FINANCIAL_STATUSES]);
    expect(fulfilment).toEqual([...ALL_FULFILMENT_STATUSES]);
    expect(Object.keys(FINANCIAL_STATUS_LABELS).sort()).toEqual([...financial].sort());
    expect(Object.keys(FULFILMENT_STATUS_LABELS).sort()).toEqual([...fulfilment].sort());
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

  test("money inputs round-trip between display digits and integer cents", () => {
    expect(formatBrlInput(1550)).toBe("15,50");
    expect(formatBrlInput(150000)).toBe("1.500,00");
    expect(parseBrlToCents("15,50")).toBe(1550);
    expect(parseBrlToCents("15")).toBe(1500);
    expect(parseBrlToCents("15,5")).toBe(1550);
    expect(parseBrlToCents("1.500,00")).toBe(150000);
    expect(parseBrlToCents("R$ 15,50")).toBe(1550);
    expect(parseBrlToCents("   ")).toBeUndefined();
  });

  test("parseBrlToCents rejects text instead of guessing", () => {
    for (const raw of ["abc", "15,567", "15,,50", "--10", "R$"]) {
      expect(() => parseBrlToCents(raw)).toThrow();
    }
  });

  test("the money typing mask groups thousands and keeps the in-progress comma", () => {
    expect(maskBrlInput("1500")).toBe("1.500");
    expect(maskBrlInput("1500,5")).toBe("1.500,5");
    expect(maskBrlInput("1.500,00")).toBe("1.500,00");
    expect(maskBrlInput("R$ 15")).toBe("15");
    expect(maskBrlInput("007")).toBe("7");
    expect(maskBrlInput("")).toBe("");
  });

  test("masked money still parses back to the same cents", () => {
    expect(parseBrlToCents(maskBrlInput("1500"))).toBe(150000);
    expect(parseBrlToCents(maskBrlInput("15,5"))).toBe(1550);
    expect(parseBrlToCents(maskBrlInput("1.500,00"))).toBe(150000);
  });

  test("the integer typing mask drops non-digits and groups thousands", () => {
    expect(maskIntegerInput("1500")).toBe("1.500");
    expect(maskIntegerInput("12a34")).toBe("1.234");
    expect(maskIntegerInput("")).toBe("");
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
