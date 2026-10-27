/* eslint-disable anti-slop/no-chained-type-assertions */
/**
 * Order lifecycle procedures — Unit (infrastructure-free), MEN-92/93/95/96/97.
 *
 * The db is faked the same way `packages/api-tenant/test/panelReads.test.ts`
 * fakes it: only the query surface the procedures touch is implemented, and a
 * transaction runs its callback against the same fakes. The point of these
 * tests is the mapping and the guards, not Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call, ORPCError } from "@orpc/server";
import { db } from "@menuza/db";
import { clearMembershipCache, hashSessionToken } from "@menuza/orpc-server/auth";
import { createOrderImpl } from "../src/domains/commerce/subdomains/orders/create.impl.ts";
import { expireOrderImpl } from "../src/domains/commerce/subdomains/orders/expire.impl.ts";
import { recordOrderPaymentImpl } from "../src/domains/commerce/subdomains/orders/recordPayment.impl.ts";
import { transitionOrderImpl } from "../src/domains/commerce/subdomains/orders/transition.impl.ts";

const TENANT_ID = randomUUID();

const MEMBER_ID = randomUUID();

const CUSTOMER_ID = randomUUID();

const SESSION_TOKEN = randomUUID();

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

/** One faked column value. Covers every column these models carry. */
type Cell = string | number | boolean | null | Temporal.PlainDateTime;

interface Row {
  [field: string]: Cell;
}

interface Counts {
  [name: string]: number;
}

const customers: Row[] = [];

const wallets: Row[] = [];

const walletTransactions: Row[] = [];

const coupons: Row[] = [];

const redemptions: Row[] = [];

const orders: Row[] = [];

const orderItems: Row[] = [];

const orderEvents: Row[] = [];

const sessions: Row[] = [];

const memberships: Row[] = [];

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

/**
 * The chainable stand-in. The procedures chain `.where().orderBy().all()` and
 * `.where().aggregate()`, and each call returns a fresh builder, so only the
 * terminal actually reached has to answer.
 */
function builder(source: Row[], filter: Row) {
  const found = () => source.filter((row) => matches(row, filter));

  return {
    select: () => builder(source, filter),
    include: () => builder(source, filter),
    orderBy: () => builder(source, filter),
    forUpdate: () => builder(source, filter),
    all: async () => found(),
    first: async () => found()[0] ?? null,
    aggregate: async (spec: (aggregate: { count: () => number }) => Counts) =>
      spec({ count: () => found().length }),
    update: async (data: Row) => {
      for (const row of found()) Object.assign(row, data);

      return found();
    },
    updateAll: async (data: Row) => {
      for (const row of found()) Object.assign(row, data);
    },
    create: async (data: Row) => {
      source.push(data);

      return data;
    },
  };
}

function model(source: Row[]) {
  return {
    where: (filter: Row) => builder(source, filter),
    create: async (data: Row) => {
      source.push(data);

      return data;
    },
  };
}

type Model = ReturnType<typeof model>;

const MODEL_NAMES = [
  "Customer",
  "Wallet",
  "WalletTransaction",
  "Coupon",
  "CouponRedemption",
  "Order",
  "OrderItem",
  "OrderEvent",
  "Session",
  "TenantMembership",
] as const;

type ModelName = (typeof MODEL_NAMES)[number];

const SOURCES: Record<ModelName, Row[]> = {
  Customer: customers,
  Wallet: wallets,
  WalletTransaction: walletTransactions,
  Coupon: coupons,
  CouponRedemption: redemptions,
  Order: orders,
  OrderItem: orderItems,
  OrderEvent: orderEvents,
  Session: sessions,
  TenantMembership: memberships,
};

/**
 * `db.orm.public.<Model>` is a prototype accessor with no setter, so a plain
 * assignment silently does not stick; the fakes have to be installed as own
 * properties. `writable`/`configurable` keep the restore symmetric.
 */
function override(name: ModelName, key: keyof Model, value: Model[keyof Model]): void {
  // SAFETY: the ORM namespace is keyed by model name, so every entry in
  // `MODEL_NAMES` is present and shaped like `Model` — which is the slice of
  // each model this test fakes.
  const target = (db.orm.public as unknown as Record<ModelName, Model>)[name];

  Object.defineProperty(target, key, { value, writable: true, configurable: true });
}

// SAFETY: captured before the fakes replace them; the same slice is restored.
const originals = Object.fromEntries(
  MODEL_NAMES.map((name) => [
    name,
    // SAFETY: same namespace fact as `override`.
    { ...((db.orm.public as unknown as Record<ModelName, Model>)[name] as unknown as object) },
  ]),
) as Record<ModelName, Model>;

function installFakes() {
  for (const name of MODEL_NAMES) {
    const fake = model(SOURCES[name]);

    override(name, "where", fake.where);
    override(name, "create", fake.create);
  }

  db.transaction = transactionStub();
}

function restoreFakes() {
  // SAFETY: `originals.transaction` is the method captured off the same client
  // before any fake was installed, so it is that member's own type.
  db.transaction = originals.transaction as typeof db.transaction;

  for (const name of MODEL_NAMES) {
    override(name, "where", originals[name].where);
    override(name, "create", originals[name].create);
  }
}

/**
 * Runs the callback against the same faked client. Nothing here needs real
 * transactional isolation: the fakes are synchronous and single-threaded.
 */
function transactionStub() {
  return async function transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
    return await fn(db);
  };
}

function reqHeaders(): Headers {
  return new Headers({
    "x-menuza-tenant-id": TENANT_ID,
    cookie: `menuza_commerce_sid=${SESSION_TOKEN}`,
  });
}

function seedSession(role = "owner") {
  sessions.push({
    id: hashSessionToken(SESSION_TOKEN),
    memberId: MEMBER_ID,
    namespace: "commerce",
    expiresAt: at("2999-01-01 00:00"),
    revokedAt: null,
    createdAt: at("2026-10-01 00:00"),
    lastUsedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
  });

  memberships.push({ id: randomUUID(), memberId: MEMBER_ID, tenantId: TENANT_ID, role });
}

function seedCustomer() {
  customers.push({
    id: CUSTOMER_ID,
    tenantId: TENANT_ID,
    name: "Maria",
    email: "maria@example.com",
    phone: "11999999999",
  });
}

function seedWallet(balanceCents: number) {
  wallets.push({
    id: randomUUID(),
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    balanceCents,
    createdAt: at("2026-10-01 00:00"),
    updatedAt: at("2026-10-01 00:00"),
  });
}

function seedOrder(overrides: Row = {}) {
  const row = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    code: "ABC234",
    customerId: CUSTOMER_ID,
    subtotalCents: 4000,
    discountCents: 0,
    shippingCents: 0,
    walletAppliedCents: 0,
    cashbackCents: 200,
    totalCents: 4000,
    financialStatus: "awaiting_payment",
    fulfilmentStatus: "pending",
    paymentMethod: "pix",
    paidAt: null,
    expiresAt: at("2026-10-01 00:00"),
    couponId: null,
    createdAt: at("2026-10-01 00:00"),
    updatedAt: at("2026-10-01 00:00"),
    ...overrides,
  };

  orders.push(row);

  return row;
}

function clearAll() {
  for (const source of Object.values(SOURCES)) source.length = 0;

  clearMembershipCache();
}

beforeAll(installFakes);

afterAll(restoreFakes);

beforeEach(() => {
  clearAll();

  installFakes();

  seedSession();
  seedCustomer();
});

describe("orders.create", () => {
  test("maps coupons into priceOrder and persists the priced order", async () => {
    coupons.push({
      id: randomUUID(),
      tenantId: TENANT_ID,
      code: "BEMVINDO10",
      discountType: "percentage",
      value: 10,
      description: null,
      usageCount: 0,
      usageLimit: null,
      perCustomerLimit: null,
      minimumOrderCents: null,
      maximumDiscountCents: null,
      shippingDiscountPercent: null,
      startsAt: null,
      endsAt: null,
      stackable: false,
      firstPurchaseOnly: false,
      status: "active",
    });

    seedWallet(0);

    const result = await call(
      createOrderImpl,
      {
        customerId: CUSTOMER_ID,
        paymentMethod: "pix",
        shippingCents: 900,
        walletRequestedCents: 0,
        lines: [{ name: "Marmita", unitPriceCents: 2000, quantity: 2 }],
        couponCodes: ["bemvindo10"],
      },
      { context: { reqHeaders: reqHeaders() } },
    );

    expect(result.code).toHaveLength(6);
    expect(result.subtotalCents).toBe(4000);
    expect(result.discountCents).toBe(400);
    expect(result.totalCents).toBe(4500);
    expect(result.financialStatus).toBe("awaiting_payment");
    expect(result.fulfilmentStatus).toBe("pending");
    expect(result.rejectedCoupons).toEqual([]);

    expect(orders).toHaveLength(1);
    expect(orders[0]?.totalCents).toBe(4500);
    expect(orderItems).toHaveLength(1);
    expect(orderItems[0]?.lineTotalCents).toBe(4000);
    expect(redemptions[0]?.discountCents).toBe(400);
    expect(coupons[0]?.usageCount).toBe(1);
  });

  test("rejects the same coupon code twice in one order", async () => {
    try {
      await call(
        createOrderImpl,
        {
          customerId: CUSTOMER_ID,
          paymentMethod: null,
          shippingCents: 0,
          walletRequestedCents: 0,
          lines: [{ name: "Marmita", unitPriceCents: 2000, quantity: 1 }],
          couponCodes: ["BEMVINDO10", "BEMVINDO10"],
        },
        { context: { reqHeaders: reqHeaders() } },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows `code`.
      expect((error as ORPCError<"VALIDATION_FAILED", unknown>).code).toBe("VALIDATION_FAILED");
    }

    expect(orders).toHaveLength(0);
  });

  test("a coupon that does not apply is reported, not thrown", async () => {
    coupons.push({
      id: randomUUID(),
      tenantId: TENANT_ID,
      code: "MINIMO50",
      discountType: "fixed",
      value: 5000,
      description: null,
      usageCount: 0,
      usageLimit: null,
      perCustomerLimit: null,
      minimumOrderCents: 10000,
      maximumDiscountCents: null,
      shippingDiscountPercent: null,
      startsAt: null,
      endsAt: null,
      stackable: false,
      firstPurchaseOnly: false,
      status: "active",
    });

    seedWallet(0);

    const result = await call(
      createOrderImpl,
      {
        customerId: CUSTOMER_ID,
        paymentMethod: null,
        shippingCents: 0,
        walletRequestedCents: 0,
        lines: [{ name: "Marmita", unitPriceCents: 2000, quantity: 1 }],
        couponCodes: ["MINIMO50"],
      },
      { context: { reqHeaders: reqHeaders() } },
    );

    expect(result.discountCents).toBe(0);
    expect(result.rejectedCoupons).toEqual([{ code: "MINIMO50", reason: "below_minimum" }]);
    expect(redemptions).toHaveLength(0);
  });
});

describe("orders.recordPayment", () => {
  test("credits cashback once when recorded twice", async () => {
    seedWallet(0);

    const order = seedOrder();

    const input = { code: order.code };

    const first = await call(recordOrderPaymentImpl, input, {
      context: { reqHeaders: reqHeaders() },
    });

    const second = await call(recordOrderPaymentImpl, input, {
      context: { reqHeaders: reqHeaders() },
    });

    expect(first).toEqual({ financialStatus: "paid", cashbackCents: 200 });
    expect(second).toEqual(first);

    const credits = walletTransactions.filter((row) => row.kind === "cashback_credit");
    expect(credits).toHaveLength(1);
    expect(credits[0]?.amountCents).toBe(200);
    expect(wallets[0]?.balanceCents).toBe(200);

    const receipts = orderEvents.filter((row) => row.type === "cashback_credited");
    expect(receipts).toHaveLength(1);
  });
});

describe("orders.expire", () => {
  // SAFETY: the token gate reads env at call time; this test sets it for the
  // duration of the case only.
  const originalSecret = process.env.INTERNAL_API_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = "test-internal-secret";
  });

  afterAll(() => {
    if (originalSecret !== undefined) process.env.INTERNAL_API_SECRET = originalSecret;
    else delete process.env.INTERNAL_API_SECRET;
  });

  function internalHeaders(): Headers {
    return new Headers({
      "x-menuza-tenant-id": TENANT_ID,
      "x-menuza-internal-token": "test-internal-secret",
    });
  }

  test("a paid order is a no-op", async () => {
    const order = seedOrder({ financialStatus: "paid", paidAt: at("2026-10-01 00:00") });

    const result = await call(
      expireOrderImpl,
      { code: order.code },
      {
        context: { reqHeaders: internalHeaders() },
      },
    );

    expect(result).toEqual({ financialStatus: "paid" });
    expect(orders[0]?.financialStatus).toBe("paid");
    expect(orderEvents).toHaveLength(0);
    expect(walletTransactions).toHaveLength(0);
  });

  test("an order whose window is still open is a no-op", async () => {
    const order = seedOrder({ expiresAt: at("2999-01-01 00:00") });

    const result = await call(
      expireOrderImpl,
      { code: order.code },
      {
        context: { reqHeaders: internalHeaders() },
      },
    );

    expect(result).toEqual({ financialStatus: "awaiting_payment" });
    expect(orderEvents).toHaveLength(0);
  });

  test("requires the internal token", async () => {
    const order = seedOrder();

    try {
      await call(
        expireOrderImpl,
        { code: order.code },
        {
          context: {
            reqHeaders: new Headers({ "x-menuza-tenant-id": TENANT_ID }),
          },
        },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows `code`.
      expect((error as ORPCError<"UNAUTHORIZED", unknown>).code).toBe("UNAUTHORIZED");
    }
  });
});

describe("orders.transition", () => {
  test("an illegal transition returns ORDER_TRANSITION_INVALID", async () => {
    const order = seedOrder({
      financialStatus: "paid",
      paidAt: at("2026-10-01 00:00"),
    });

    try {
      await call(
        transitionOrderImpl,
        { code: order.code, axis: "financial", to: "canceled", reason: "cliente pediu" },
        { context: { reqHeaders: reqHeaders() } },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows `code`.
      expect((error as ORPCError<"ORDER_TRANSITION_INVALID", { reason: string }>).code).toBe(
        "ORDER_TRANSITION_INVALID",
      );
    }

    expect(orders[0]?.financialStatus).toBe("paid");
    expect(orderEvents).toHaveLength(0);
  });

  test("a transition requiring a reason returns REASON_REQUIRED", async () => {
    const order = seedOrder({ fulfilmentStatus: "preparing" });

    try {
      await call(
        transitionOrderImpl,
        { code: order.code, axis: "fulfilment", to: "canceled" },
        { context: { reqHeaders: reqHeaders() } },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows `code`.
      expect((error as ORPCError<"REASON_REQUIRED", unknown>).code).toBe("REASON_REQUIRED");
    }

    expect(orders[0]?.fulfilmentStatus).toBe("preparing");
    expect(orderEvents).toHaveLength(0);
  });

  test("a legal transition moves one axis and appends the event", async () => {
    const order = seedOrder({ fulfilmentStatus: "confirmed" });

    const result = await call(
      transitionOrderImpl,
      { code: order.code, axis: "fulfilment", to: "preparing" },
      { context: { reqHeaders: reqHeaders() } },
    );

    expect(result).toEqual({
      financialStatus: "awaiting_payment",
      fulfilmentStatus: "preparing",
    });
    expect(orderEvents).toHaveLength(1);
    expect(orderEvents[0]?.type).toBe("fulfilment_changed");
  });
});
