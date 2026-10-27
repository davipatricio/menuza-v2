/* eslint-disable anti-slop/no-chained-type-assertions */
/**
 * Payment gateway callbacks — Unit (infrastructure-free).
 *
 * These cover the four things a gateway integration has to get right: the
 * payload is decoded rather than trusted, a provider replay is a no-op, only
 * `paid` moves an order, and an amount that disagrees with the order is
 * refused instead of marking the wrong money as received.
 *
 * The db is faked the way `orders.test.ts` fakes it: plain arrays behind
 * `db.orm.public.<Model>`, and a transaction that runs its callback against the
 * same fakes. No Postgres.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call, ORPCError } from "@orpc/server";
import { db } from "@menuza/db";
import { encryptSecret } from "@menuza/orpc-server/crypto";
import type { PaymentJobPayload } from "@menuza/shared/commerce";
import { acceptPaymentWebhook } from "../src/domains/commerce/subdomains/payments/receive.ts";
import { applyGatewayEventImpl } from "../src/domains/commerce/subdomains/payments/applyGatewayEvent.impl.ts";
import {
  mapPagarMeEventType,
  parsePagarMeEvent,
  verifyPagarMeAuthorization,
} from "../src/domains/commerce/subdomains/payments/pagarme.ts";

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

const TENANT_ID = randomUUID();

const CUSTOMER_ID = randomUUID();

const INTEGRATION_ID = randomUUID();

const WEBHOOK_TOKEN = "0123456789abcdef0123456789abcdef";

const SECRET_KEY = "sk_test_abc123";

/** One faked column value. Covers every column these models carry. */
type Cell = string | number | boolean | null | Temporal.PlainDateTime;

interface Row {
  [field: string]: Cell;
}

const integrations: Row[] = [];

const events: Row[] = [];

const orders: Row[] = [];

const orderEvents: Row[] = [];

const wallets: Row[] = [];

const walletTransactions: Row[] = [];

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

/** The chainable stand-in; only the terminal actually reached has to answer. */
function builder(source: Row[], filter: Row) {
  const found = () => source.filter((row) => matches(row, filter));

  return {
    forUpdate: () => builder(source, filter),
    all: async () => found(),
    first: async () => found()[0] ?? null,
    updateAll: async (data: Row) => {
      for (const row of found()) Object.assign(row, data);
    },
    deleteAll: async () => {
      const removed = new Set(found());

      const kept = source.filter((row) => !removed.has(row));

      source.splice(0, source.length, ...kept);
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
  "PaymentIntegration",
  "GatewayEvent",
  "Order",
  "OrderEvent",
  "Wallet",
  "WalletTransaction",
] as const;

type ModelName = (typeof MODEL_NAMES)[number];

const SOURCES: Record<ModelName, Row[]> = {
  PaymentIntegration: integrations,
  GatewayEvent: events,
  Order: orders,
  OrderEvent: orderEvents,
  Wallet: wallets,
  WalletTransaction: walletTransactions,
};

/**
 * `db.orm.public.<Model>` is a prototype accessor with no setter, so the fakes
 * have to be installed as own properties.
 */
function override(name: ModelName, key: keyof Model, value: Model[keyof Model]): void {
  // SAFETY: the ORM namespace is keyed by model name, so every entry in
  // `MODEL_NAMES` is present and shaped like `Model` — the slice each fake implements.
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

function transactionStub() {
  return async function transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
    return await fn(db);
  };
}

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

function seedIntegration(overrides: Row = {}) {
  const row = {
    id: INTEGRATION_ID,
    tenantId: TENANT_ID,
    provider: "pagarme",
    label: "Pagar.me",
    status: "active",
    credentials: encryptSecret(JSON.stringify({ secretKey: SECRET_KEY })),
    webhookToken: WEBHOOK_TOKEN,
    createdAt: at("2026-10-01 00:00"),
    updatedAt: at("2026-10-01 00:00"),
    ...overrides,
  };

  integrations.push(row);

  return row;
}

function seedWallet(balanceCents = 0) {
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
    expiresAt: at("2026-10-02 00:00"),
    couponId: null,
    createdAt: at("2026-10-01 00:00"),
    updatedAt: at("2026-10-01 00:00"),
    ...overrides,
  };

  orders.push(row);

  return row;
}

function body(event: {
  type: string;
  id: string;
  data?: { code?: string; amount?: number };
}): string {
  return JSON.stringify(event);
}

async function receive(rawBody: string, authorization: string | null = null) {
  const enqueued: PaymentJobPayload[] = [];

  const result = await acceptPaymentWebhook({
    token: WEBHOOK_TOKEN,
    authorization,
    rawBody,
    enqueue: async (payload) => {
      enqueued.push(payload);
    },
  });

  return { result, enqueued };
}

function internalHeaders(): Headers {
  return new Headers({
    "x-menuza-tenant-id": TENANT_ID,
    "x-menuza-internal-token": "test-internal-secret",
  });
}

/** The worker only ever sends the event id; the tenant arrives as a header. */
function apply(job: PaymentJobPayload) {
  return call(
    applyGatewayEventImpl,
    { gatewayEventId: job.gatewayEventId },
    { context: { reqHeaders: internalHeaders() } },
  );
}

const paidBody = body({
  type: "order.paid",
  id: "evt_1",
  data: { code: "ABC234", amount: 4000 },
});

beforeAll(() => {
  process.env.INTEGRATION_SECRET_KEY = Buffer.alloc(32, 7).toString("base64url");
  process.env.INTERNAL_API_SECRET = "test-internal-secret";

  installFakes();
});

afterAll(() => {
  restoreFakes();

  delete process.env.INTEGRATION_SECRET_KEY;
  delete process.env.INTERNAL_API_SECRET;
});

beforeEach(() => {
  for (const source of Object.values(SOURCES)) source.length = 0;

  installFakes();
});

describe("Pagar.me payload", () => {
  test("decodes the documented envelope", () => {
    expect(
      parsePagarMeEvent(
        body({ type: "order.paid", id: "evt_1", data: { code: "ABC234", amount: 4000 } }),
      ),
    ).toEqual({ externalId: "evt_1", type: "order.paid", orderCode: "ABC234", amountCents: 4000 });
  });

  test("falls back to the nested order object", () => {
    const raw = JSON.stringify({
      type: "charge.paid",
      id: "evt_2",
      data: { order: { code: "XYZ987", amount: 1290 } },
    });

    expect(parsePagarMeEvent(raw)).toEqual({
      externalId: "evt_2",
      type: "charge.paid",
      orderCode: "XYZ987",
      amountCents: 1290,
    });
  });

  test("refuses what it cannot identify", () => {
    expect(parsePagarMeEvent("{not json")).toBeNull();
    expect(parsePagarMeEvent(JSON.stringify({ type: "order.paid" }))).toBeNull();
    expect(parsePagarMeEvent(JSON.stringify({ id: "evt_3" }))).toBeNull();
  });

  test("maps only the events that move money", () => {
    expect(mapPagarMeEventType("order.paid")).toBe("paid");
    expect(mapPagarMeEventType("charge.paid")).toBe("paid");
    expect(mapPagarMeEventType("order.payment_failed")).toBe("payment_failed");
    expect(mapPagarMeEventType("charge.payment_failed")).toBe("payment_failed");
    expect(mapPagarMeEventType("charge.refunded")).toBe("ignored");
    expect(mapPagarMeEventType("order.canceled")).toBe("ignored");
    expect(mapPagarMeEventType("constructor")).toBe("ignored");
  });

  test("verifies the basic authorization header", () => {
    const header = `Basic ${Buffer.from(`${SECRET_KEY}:`, "utf8").toString("base64")}`;

    expect(verifyPagarMeAuthorization(header, SECRET_KEY)).toBe(true);
    expect(verifyPagarMeAuthorization(header, "sk_test_other")).toBe(false);
    expect(verifyPagarMeAuthorization("Bearer abc", SECRET_KEY)).toBe(false);
  });
});

describe("acceptPaymentWebhook", () => {
  test("records the event once and re-enqueues the same job on a replay", async () => {
    seedIntegration();

    const first = await receive(paidBody);

    const second = await receive(paidBody);

    expect(first.result).toEqual({ status: 200, received: true });
    expect(second.result).toEqual({ status: 200, received: true });
    expect(events).toHaveLength(1);

    // Both deliveries hand the same deterministic payload to BullMQ, which
    // collapses them onto one job id.
    expect(first.enqueued).toHaveLength(1);
    expect(second.enqueued).toEqual(first.enqueued);
    expect(first.enqueued[0]?.gatewayEventId).toBe(events[0]?.id);
  });

  test("an unknown token is not found", async () => {
    seedIntegration();

    const result = await acceptPaymentWebhook({
      token: "unknown",
      authorization: null,
      rawBody: paidBody,
      enqueue: async () => {},
    });

    expect(result).toEqual({ status: 404, received: false });
    expect(events).toHaveLength(0);
  });

  test("a disabled integration looks exactly like an unknown token", async () => {
    seedIntegration({ status: "disabled" });

    const { result } = await receive(paidBody);

    expect(result).toEqual({ status: 404, received: false });
  });

  test("a body it cannot read is rejected, not silently dropped", async () => {
    seedIntegration();

    const { result } = await receive("{not json");

    expect(result).toEqual({ status: 400, received: false });
    expect(events).toHaveLength(0);
  });

  test("a wrong provider secret is unauthorized", async () => {
    seedIntegration();

    const wrong = `Basic ${Buffer.from("sk_test_wrong:", "utf8").toString("base64")}`;

    const { result } = await receive(paidBody, wrong);

    expect(result).toEqual({ status: 401, received: false });
    expect(events).toHaveLength(0);
  });

  test("the stored secret authenticates the callback", async () => {
    seedIntegration();

    const header = `Basic ${Buffer.from(`${SECRET_KEY}:`, "utf8").toString("base64")}`;

    const { result } = await receive(paidBody, header);

    expect(result).toEqual({ status: 200, received: true });
  });
});

describe("payments.applyGatewayEvent", () => {
  test("a paid event marks the order paid and credits the cashback once", async () => {
    seedIntegration();
    seedWallet();

    const order = seedOrder();

    const { enqueued } = await receive(paidBody);

    const [job] = enqueued;

    if (!job) throw new Error("the webhook did not enqueue an event");

    const first = await apply(job);

    const second = await apply(job);

    expect(first).toEqual({ status: "applied" });
    expect(second).toEqual({ status: "applied" });
    expect(order.financialStatus).toBe("paid");
    expect(order.paidAt).not.toBeNull();

    const credits = walletTransactions.filter((row) => row.kind === "cashback_credit");
    expect(credits).toHaveLength(1);
    expect(credits[0]?.amountCents).toBe(200);
    expect(wallets[0]?.balanceCents).toBe(200);

    expect(orderEvents.filter((row) => row.type === "payment_recorded")).toHaveLength(1);
    expect(events[0]?.status).toBe("processed");
  });

  test("a second confirmation event for the same order is a no-op", async () => {
    seedIntegration();
    seedWallet();

    const order = seedOrder();

    // Pagar.me emits both `order.paid` and `charge.paid` for one payment. They
    // are distinct events, so both reach `markOrderPaid`; the order lock and the
    // status check are what keep the second from crediting again.
    const first = await receive(
      body({ type: "order.paid", id: "evt_20", data: { code: "ABC234", amount: 4000 } }),
    );

    const second = await receive(
      body({ type: "charge.paid", id: "evt_21", data: { code: "ABC234", amount: 4000 } }),
    );

    const [firstJob] = first.enqueued;

    const [secondJob] = second.enqueued;

    if (!firstJob || !secondJob) throw new Error("a webhook did not enqueue an event");

    expect(await apply(firstJob)).toEqual({ status: "applied" });
    expect(await apply(secondJob)).toEqual({ status: "applied" });

    expect(order.financialStatus).toBe("paid");
    expect(walletTransactions.filter((row) => row.kind === "cashback_credit")).toHaveLength(1);
    expect(orderEvents.filter((row) => row.type === "payment_recorded")).toHaveLength(1);
  });

  test("an amount that disagrees with the order is rejected", async () => {
    seedIntegration();
    seedWallet();

    const order = seedOrder();

    const { enqueued } = await receive(
      body({ type: "order.paid", id: "evt_9", data: { code: "ABC234", amount: 100 } }),
    );

    const [job] = enqueued;

    if (!job) throw new Error("the webhook did not enqueue an event");

    const result = await apply(job);

    expect(result).toEqual({ status: "rejected" });
    expect(order.financialStatus).toBe("awaiting_payment");
    expect(walletTransactions).toHaveLength(0);
    expect(events[0]?.status).toBe("rejected");
  });

  test("an event for an order this store does not have is ignored", async () => {
    seedIntegration();

    const { enqueued } = await receive(
      body({ type: "order.paid", id: "evt_10", data: { code: "NOPE00", amount: 4000 } }),
    );

    const [job] = enqueued;

    if (!job) throw new Error("the webhook did not enqueue an event");

    const result = await apply(job);

    expect(result).toEqual({ status: "ignored" });
    expect(events[0]?.status).toBe("ignored");
  });

  test("a declined payment leaves the order awaiting", async () => {
    seedIntegration();
    seedWallet();

    const order = seedOrder();

    const { enqueued } = await receive(
      body({
        type: "charge.payment_failed",
        id: "evt_11",
        data: { code: "ABC234", amount: 4000 },
      }),
    );

    const [job] = enqueued;

    if (!job) throw new Error("the webhook did not enqueue an event");

    const result = await apply(job);

    expect(result).toEqual({ status: "applied" });
    expect(order.financialStatus).toBe("awaiting_payment");
    expect(orderEvents).toHaveLength(0);
  });

  test("an unknown event id is reported missing", async () => {
    const result = await call(
      applyGatewayEventImpl,
      { gatewayEventId: randomUUID() },
      { context: { reqHeaders: internalHeaders() } },
    );

    expect(result).toEqual({ status: "missing" });
  });

  test("requires the internal token", async () => {
    try {
      await call(
        applyGatewayEventImpl,
        { gatewayEventId: randomUUID() },
        { context: { reqHeaders: new Headers({ "x-menuza-tenant-id": TENANT_ID }) } },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows `code`.
      expect((error as ORPCError<"UNAUTHORIZED", unknown>).code).toBe("UNAUTHORIZED");
    }
  });
});
