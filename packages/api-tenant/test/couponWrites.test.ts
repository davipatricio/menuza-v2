/* eslint-disable anti-slop/no-chained-type-assertions */
/* eslint-disable anti-slop/no-runtime-typeof -- the Coupon, Order and
   CouponRedemption `where` doubles have to route both call shapes the coupon
   writes and reads use (an object filter from the status update, a predicate
   callback from the tenant, id and soft-delete lookups) to the same matcher.
   Telling a callable from a plain object *is* a runtime type check; there is no
   domain value to branch on, because the double's input is a query-builder
   convention rather than parsed data. */
/**
 * Coupon writes — Unit (infrastructure-free).
 *
 * Delete is the interesting half: a coupon an order or a redemption still names
 * is archived (`deletedAt` stamped, status forced to `disabled`) because a hard
 * delete would cascade the redemption ledger away and null `Order.couponId`. The
 * order-only case is the one the old implementation missed — zero redemptions
 * does not mean zero references. The db is faked the way `panelReads.test.ts`
 * and `catalog.test.ts` fake it, and the transaction stub restores the fixtures
 * when the callback throws, so the bulk rollback is observable.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { db } from "@menuza/db";
import { hashPassword } from "@menuza/orpc-server/auth";
import { loginImpl } from "../src/domains/tenant/subdomains/session/login.impl.ts";
import { deleteCouponImpl } from "../src/domains/tenant/subdomains/panel/deleteCoupon.impl.ts";
import { bulkDeleteCouponsImpl } from "../src/domains/tenant/subdomains/panel/bulkDeleteCoupons.impl.ts";
import { setCouponStatusImpl } from "../src/domains/tenant/subdomains/panel/setCouponStatus.impl.ts";
import { listCouponsImpl } from "../src/domains/tenant/subdomains/panel/listCoupons.impl.ts";
import { listCouponSummariesImpl } from "../src/domains/tenant/subdomains/panel/listCouponSummaries.impl.ts";
import { getCouponDetailImpl } from "../src/domains/tenant/subdomains/panel/getCouponDetail.impl.ts";

interface MemberRow {
  id: string;
  email: string;
  name: string | null;
  kind: string;
  passwordHash: string | null;
  createdAt: Temporal.PlainDateTime;
  updatedAt: Temporal.PlainDateTime;
}

interface TenantRow {
  id: string;
  slug: string;
  displayName: string;
  createdAt: Temporal.PlainDateTime;
  updatedAt: Temporal.PlainDateTime;
}

interface MembershipRow {
  id: string;
  memberId: string;
  tenantId: string;
  role: string;
  createdAt: Temporal.PlainDateTime;
}

interface SessionRow {
  id: string;
  memberId: string;
  namespace: string;
  expiresAt: Temporal.PlainDateTime;
  revokedAt: Temporal.PlainDateTime | null;
  createdAt: Temporal.PlainDateTime;
  lastUsedAt: Temporal.PlainDateTime;
}

interface CouponRow {
  id: string;
  tenantId: string;
  code: string;
  description: string | null;
  discountType: "percentage" | "fixed";
  value: number;
  usageCount: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  minimumOrderCents: number | null;
  maximumDiscountCents: number | null;
  shippingDiscountPercent: number | null;
  startsAt: Temporal.PlainDateTime | null;
  endsAt: Temporal.PlainDateTime | null;
  stackable: boolean;
  firstPurchaseOnly: boolean;
  status: string;
  productScopeMode: string;
  deletedAt: Temporal.PlainDateTime | null;
  products?: readonly { readonly productId: string }[];
}

interface OrderRow {
  id: string;
  tenantId: string;
  code: string;
  customerId: string;
  couponId: string | null;
  totalCents: number;
  createdAt: Temporal.PlainDateTime;
}

interface RedemptionRow {
  id: string;
  tenantId: string;
  couponId: string;
  customerId: string;
  orderId: string;
  discountCents: number;
  createdAt: Temporal.PlainDateTime;
}

const members: MemberRow[] = [];

const tenants: TenantRow[] = [];

const memberships: MembershipRow[] = [];

const sessions: SessionRow[] = [];

const coupons: CouponRow[] = [];

const orders: OrderRow[] = [];

const redemptions: RedemptionRow[] = [];

// SAFETY: Captured once, before `installFakes` overwrites the model accessors;
// the transaction runner is restored the same way.
const originals = {
  memberWhere: db.orm.public.Member.where,
  tenantWhere: db.orm.public.Tenant.where,
  membershipWhere: db.orm.public.TenantMembership.where,
  sessionWhere: db.orm.public.Session.where,
  sessionCreate: db.orm.public.Session.create,
  couponWhere: db.orm.public.Coupon.where,
  orderWhere: db.orm.public.Order.where,
  redemptionWhere: db.orm.public.CouponRedemption.where,
  transaction: db.transaction,
};

// SAFETY: Distinct random ids, so no fixture can collide with another's row.
const OWNER_ID = randomUUID();

const STAFF_ID = randomUUID();

const TENANT_ID = randomUUID();

const OTHER_TENANT_ID = randomUUID();

const CUSTOMER_ID = randomUUID();

const COOKIE_NAME = "menuza_tenant_sid";

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

/**
 * The columns a coupon filter can narrow, compared per column. `deletedAt: null`
 * is a value, so the key's presence — not its truthiness — is what narrows to
 * the live rows.
 */
function matchesCoupon(row: CouponRow, filter: CouponFilter): boolean {
  return (
    (filter.tenantId === undefined || row.tenantId === filter.tenantId) &&
    (filter.id === undefined || row.id === filter.id) &&
    (!("deletedAt" in filter) || row.deletedAt === filter.deletedAt)
  );
}

function matchesOrder(row: OrderRow, filter: OrderFilter): boolean {
  return (
    (filter.tenantId === undefined || row.tenantId === filter.tenantId) &&
    (filter.code === undefined || row.code === filter.code) &&
    (filter.couponId === undefined || row.couponId === filter.couponId)
  );
}

/** A chainable no-op builder: reads chain, and only the terminal is answered. */
function rows<T>(source: readonly T[]) {
  const builder = () => ({
    select: () => builder(),
    include: () => builder(),
    orderBy: () => builder(),
    limit: () => builder(),
    offset: () => builder(),
    groupBy: () => builder(),
    all: async () => [...source],
    first: async () => source[0] ?? null,
  });

  return builder();
}

/** The object filters a coupon write passes, plus the predicate they become. */
interface CouponFilter {
  tenantId?: string;
  id?: string;
  deletedAt?: Temporal.PlainDateTime | null;
}

/** The field proxy the coupon predicates receive: one `eq` per column. */
interface CouponPredicateFields {
  tenantId: { eq(value: string): void };
  id: { eq(value: string): void };
  deletedAt: { eq(value: Temporal.PlainDateTime | null): void };
}

function evaluateCouponPredicate(predicate: (coupon: CouponPredicateFields) => void): CouponFilter {
  const filter: CouponFilter = {};

  predicate({
    tenantId: {
      eq: (value) => {
        filter.tenantId = value;
      },
    },
    id: {
      eq: (value) => {
        filter.id = value;
      },
    },
    deletedAt: {
      eq: (value) => {
        filter.deletedAt = value;
      },
    },
  });

  return filter;
}

interface OrderFilter {
  tenantId?: string;
  couponId?: string | null;
  code?: string;
}

interface OrderPredicateFields {
  tenantId: { eq(value: string): void };
  couponId: { eq(value: string): void };
  code: { eq(value: string): void };
}

function evaluateOrderPredicate(predicate: (order: OrderPredicateFields) => void): OrderFilter {
  const filter: OrderFilter = {};

  predicate({
    tenantId: {
      eq: (value) => {
        filter.tenantId = value;
      },
    },
    couponId: {
      eq: (value) => {
        filter.couponId = value;
      },
    },
    code: {
      eq: (value) => {
        filter.code = value;
      },
    },
  });

  return filter;
}

interface RedemptionFilter {
  tenantId?: string;
  couponId?: string | readonly string[];
  customerId?: string | readonly string[];
  orderId?: string | readonly string[];
}

interface RedemptionPredicateFields {
  tenantId: { eq(value: string): void };
  couponId: { eq(value: string): void; in(values: readonly string[]): void };
  customerId: { eq(value: string): void; in(values: readonly string[]): void };
  orderId: { eq(value: string): void; in(values: readonly string[]): void };
}

function evaluateRedemptionPredicate(
  predicate: (redemption: RedemptionPredicateFields) => void,
): RedemptionFilter {
  const filter: RedemptionFilter = {};

  predicate({
    tenantId: {
      eq: (value) => {
        filter.tenantId = value;
      },
    },
    couponId: {
      eq: (value) => {
        filter.couponId = value;
      },
      in: (values) => {
        filter.couponId = values;
      },
    },
    customerId: {
      eq: (value) => {
        filter.customerId = value;
      },
      in: (values) => {
        filter.customerId = values;
      },
    },
    orderId: {
      eq: (value) => {
        filter.orderId = value;
      },
      in: (values) => {
        filter.orderId = values;
      },
    },
  });

  return filter;
}

/** One column narrowed either by equality or by `in`, the two shapes used. */
function matchesColumn(
  value: string,
  expected: string | readonly string[] | null | undefined,
): boolean {
  if (expected === undefined) return true;

  if (expected === null || typeof expected === "string") return value === expected;

  return expected.includes(value);
}

function matchesRedemption(row: RedemptionRow, filter: RedemptionFilter): boolean {
  return (
    (filter.tenantId === undefined || row.tenantId === filter.tenantId) &&
    matchesColumn(row.couponId, filter.couponId) &&
    matchesColumn(row.customerId, filter.customerId) &&
    matchesColumn(row.orderId, filter.orderId)
  );
}

/** The Coupon builder: it adds the write terminals to the read chain. */
function couponBuilder(source: readonly CouponRow[]) {
  const builder = (): any => ({
    select: () => builder(),
    include: () => builder(),
    orderBy: () => builder(),
    first: async () => source[0] ?? null,
    all: async () => [...source],
    updateAll: async (data: Partial<CouponRow>) => {
      for (const row of source) Object.assign(row, data);

      return [...source];
    },
    // `deleteAll`, not `delete`: the procedures use the `*All` terminals so the
    // tenant predicate stays in the query.
    deleteAll: async () => {
      for (const row of source) {
        const index = coupons.indexOf(row);

        if (index >= 0) coupons.splice(index, 1);
      }
    },
  });

  return builder();
}

function installFakes() {
  // SAFETY: Mocking Member.where; only `.first()` by id or email is read.
  db.orm.public.Member.where = ((filter: { id?: string; email?: string }) => ({
    first: async () =>
      members.find(
        (row) =>
          (filter.id !== undefined && row.id === filter.id) ||
          (filter.email !== undefined && row.email === filter.email),
      ) ?? null,
  })) as any;

  // SAFETY: Mocking Tenant.where; only `.first()` by id or slug is read.
  db.orm.public.Tenant.where = ((filter: { id?: string; slug?: string }) => ({
    first: async () =>
      tenants.find(
        (row) =>
          (filter.id !== undefined && row.id === filter.id) ||
          (filter.slug !== undefined && row.slug === filter.slug),
      ) ?? null,
  })) as any;

  // SAFETY: Mocking TenantMembership.where; `.first()` by member/tenant and
  // `.all()` by member are read.
  db.orm.public.TenantMembership.where = ((filter: { memberId?: string; tenantId?: string }) => ({
    first: async () =>
      memberships.find(
        (row) =>
          (filter.memberId === undefined || row.memberId === filter.memberId) &&
          (filter.tenantId === undefined || row.tenantId === filter.tenantId),
      ) ?? null,
    all: async () =>
      memberships.filter(
        (row) => filter.memberId === undefined || row.memberId === filter.memberId,
      ),
  })) as any;

  // SAFETY: Mocking Session.where; the row key is the token digest, already
  // hashed before it reaches the filter.
  db.orm.public.Session.where = ((filter: { id: string }) => ({
    first: async () => sessions.find((row) => row.id === filter.id) ?? null,
    updateAll: async (data: { revokedAt?: Temporal.PlainDateTime }) => {
      for (const row of sessions) {
        if (row.id === filter.id && data.revokedAt) row.revokedAt = data.revokedAt;
      }
    },
  })) as any;

  // SAFETY: Mocking Session.create; appends the row login writes.
  db.orm.public.Session.create = (async (data: SessionRow) => {
    sessions.push(data);

    return data;
  }) as any;

  // SAFETY: Mocking Coupon.where; the reads take the predicate form (tenant,
  // id and `deletedAt.eq(null)`), the status write the object form.
  db.orm.public.Coupon.where = ((
    filterOrPredicate: CouponFilter | ((coupon: CouponPredicateFields) => void),
  ) => {
    const filter =
      typeof filterOrPredicate === "function"
        ? evaluateCouponPredicate(filterOrPredicate)
        : filterOrPredicate;

    return couponBuilder(coupons.filter((row) => matchesCoupon(row, filter)));
  }) as any;

  // SAFETY: Mocking Order.where; the delete rule asks whether any order names
  // the coupon, which is a predicate the object filter cannot express.
  db.orm.public.Order.where = ((
    filterOrPredicate: OrderFilter | ((order: OrderPredicateFields) => void),
  ) => {
    const filter =
      typeof filterOrPredicate === "function"
        ? evaluateOrderPredicate(filterOrPredicate)
        : filterOrPredicate;

    return rows(orders.filter((row) => matchesOrder(row, filter)));
  }) as any;

  // SAFETY: Mocking CouponRedemption.where; the link check reads one row and
  // the summary reads chain a narrowing `where` before `groupBy().aggregate()`.
  db.orm.public.CouponRedemption.where = ((
    filterOrPredicate: RedemptionFilter | ((redemption: RedemptionPredicateFields) => void),
  ) => {
    const filter =
      typeof filterOrPredicate === "function"
        ? evaluateRedemptionPredicate(filterOrPredicate)
        : filterOrPredicate;

    const builder = (source: readonly RedemptionRow[]): any => ({
      where: (predicate: (redemption: RedemptionPredicateFields) => void) =>
        builder(
          source.filter((row) => matchesRedemption(row, evaluateRedemptionPredicate(predicate))),
        ),
      select: () => builder(source),
      include: () => builder(source),
      orderBy: () => builder(source),
      limit: () => builder(source),
      offset: () => builder(source),
      groupBy: () => builder(source),
      aggregate: async () => [],
      all: async () => [...source],
      first: async () => source[0] ?? null,
    });

    return builder(redemptions.filter((row) => matchesRedemption(row, filter)));
  }) as any;

  installTransactionStub();
}

/**
 * Runs the callback against the same fakes, and restores the coupon fixtures
 * when it throws. Nothing else is mutated inside a transaction here, so that
 * snapshot is the whole rollback surface — and it is what makes the batch's
 * all-or-nothing contract observable without Postgres.
 */
function installTransactionStub() {
  // SAFETY: the stub answers the same `orm` surface the procedures use; the
  // real transaction context also carries `query`/`execute`, which they do not.
  db.transaction = async function transaction<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
    const snapshot = coupons.map((row) => ({ ...row }));

    try {
      return await fn(db);
    } catch (error) {
      coupons.length = 0;

      coupons.push(...snapshot);

      throw error;
    }
  } as unknown as typeof db.transaction;
}

function restoreFakes() {
  db.orm.public.Member.where = originals.memberWhere;
  db.orm.public.Tenant.where = originals.tenantWhere;
  db.orm.public.TenantMembership.where = originals.membershipWhere;
  db.orm.public.Session.where = originals.sessionWhere;
  db.orm.public.Session.create = originals.sessionCreate;
  db.orm.public.Coupon.where = originals.couponWhere;
  db.orm.public.Order.where = originals.orderWhere;
  db.orm.public.CouponRedemption.where = originals.redemptionWhere;
  db.transaction = originals.transaction;
}

function cookieToken(resHeaders: Headers): string {
  const match = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(resHeaders.get("set-cookie") ?? "");

  return match?.[1] ?? "";
}

async function cookieFor(email: string): Promise<Headers> {
  const resHeaders = new Headers();

  await call(
    loginImpl,
    { email, password: "senha-correta" },
    { context: { resHeaders, reqHeaders: new Headers() } },
  );

  return new Headers({ cookie: `${COOKIE_NAME}=${cookieToken(resHeaders)}` });
}

const ownerCookie = () => cookieFor("marina@menuza.local");

const staffCookie = () => cookieFor("bruna@menuza.local");

/** One seeded coupon, in the z-less panel form the writes read back. */
function seedCoupon(overrides: Partial<CouponRow> = {}): CouponRow {
  const row: CouponRow = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    code: "CUPOM",
    description: null,
    discountType: "fixed",
    value: 500,
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
    productScopeMode: "include",
    deletedAt: null,
    ...overrides,
  };

  coupons.push(row);

  return row;
}

function seedRedemption(couponId: string): RedemptionRow {
  const row: RedemptionRow = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    couponId,
    customerId: CUSTOMER_ID,
    orderId: randomUUID(),
    discountCents: 500,
    createdAt: at("2026-09-20 12:30"),
  };

  redemptions.push(row);

  return row;
}

function seedOrder(couponId: string): OrderRow {
  const row: OrderRow = {
    id: randomUUID(),
    tenantId: TENANT_ID,
    code: `ORD-${coupons.length}`,
    customerId: CUSTOMER_ID,
    couponId,
    totalCents: 9950,
    createdAt: at("2026-09-20 12:30"),
  };

  orders.push(row);

  return row;
}

function couponById(couponId: string): CouponRow | undefined {
  return coupons.find((row) => row.id === couponId);
}

/** The procedure failures this file asserts: the shared code and the message. */
async function failureOf(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    // SAFETY: the procedures only throw ORPCError; the fields asserted are its
    // public `code` and `message`.
    const failure = error as { code?: string; message?: string };

    return { code: failure.code ?? "", message: failure.message ?? "" };
  }

  throw new Error("expected the call to fail");
}

describe("panel coupon writes — Unit (infrastructure-free)", () => {
  beforeAll(async () => {
    installFakes();

    members.push({
      id: OWNER_ID,
      email: "marina@menuza.local",
      name: "Marina Lopes",
      kind: "human",
      passwordHash: await hashPassword("senha-correta"),
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    members.push({
      id: STAFF_ID,
      email: "bruna@menuza.local",
      name: "Bruna",
      kind: "human",
      passwordHash: await hashPassword("senha-correta"),
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    tenants.push({
      id: TENANT_ID,
      slug: "mawifoods",
      displayName: "Mawifoods",
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    tenants.push({
      id: OTHER_TENANT_ID,
      slug: "loja-de-outro",
      displayName: "Loja de Outro",
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    memberships.push({
      id: randomUUID(),
      memberId: OWNER_ID,
      tenantId: TENANT_ID,
      role: "owner",
      createdAt: at("2026-01-01 00:00"),
    });

    memberships.push({
      id: randomUUID(),
      memberId: STAFF_ID,
      tenantId: TENANT_ID,
      role: "staff",
      createdAt: at("2026-01-01 00:00"),
    });
  });

  afterAll(() => {
    restoreFakes();
  });

  describe("panel.deleteCoupon", () => {
    test("archives a coupon a redemption still names", async () => {
      const reqHeaders = await ownerCookie();
      const coupon = seedCoupon({ code: "RESGATADO" });

      seedRedemption(coupon.id);

      const result = await call(
        deleteCouponImpl,
        { storeSlug: "mawifoods", couponId: coupon.id },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ success: true, archived: true });

      const stored = couponById(coupon.id);

      expect(stored).toBeDefined();
      expect(stored?.deletedAt).toBeInstanceOf(Temporal.PlainDateTime);
      expect(stored?.status).toBe("disabled");
    });

    test("deletes a coupon nothing points at", async () => {
      const reqHeaders = await ownerCookie();
      const coupon = seedCoupon({ code: "SEM-VINCULO" });

      const result = await call(
        deleteCouponImpl,
        { storeSlug: "mawifoods", couponId: coupon.id },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ success: true, archived: false });
      expect(couponById(coupon.id)).toBeUndefined();
    });

    test("archives a coupon an order names even with no redemptions", async () => {
      const reqHeaders = await ownerCookie();
      const coupon = seedCoupon({ code: "SO-PEDIDO" });

      seedOrder(coupon.id);

      const result = await call(
        deleteCouponImpl,
        { storeSlug: "mawifoods", couponId: coupon.id },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ success: true, archived: true });
      expect(couponById(coupon.id)?.status).toBe("disabled");
    });

    test("a repeated delete is NOT_FOUND rather than a second archive", async () => {
      const reqHeaders = await ownerCookie();

      const coupon = seedCoupon({
        code: "JA-ARQUIVADO",
        status: "disabled",
        deletedAt: at("2026-01-02 00:00"),
      });

      const failure = await failureOf(
        call(
          deleteCouponImpl,
          { storeSlug: "mawifoods", couponId: coupon.id },
          { context: { reqHeaders } },
        ),
      );

      expect(failure.code).toBe("NOT_FOUND");
    });
  });

  describe("panel.bulkDeleteCoupons", () => {
    test("counts the deleted and the archived rows", async () => {
      const reqHeaders = await ownerCookie();
      const linked = seedCoupon({ code: "LOTE-RESGATADO" });
      const unlinked = seedCoupon({ code: "LOTE-SOLTO" });

      seedRedemption(linked.id);

      const result = await call(
        bulkDeleteCouponsImpl,
        { storeSlug: "mawifoods", couponIds: [linked.id, unlinked.id] },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ deleted: 1, archived: 1 });
      expect(couponById(linked.id)?.deletedAt).toBeInstanceOf(Temporal.PlainDateTime);
      expect(couponById(unlinked.id)).toBeUndefined();
    });

    test("a foreign id aborts the batch and rolls back the earlier deletes", async () => {
      const reqHeaders = await ownerCookie();
      const unlinked = seedCoupon({ code: "LOTE-ABORTADO" });
      const linked = seedCoupon({ code: "LOTE-ABORTADO-VINCULO" });

      seedRedemption(linked.id);

      const failure = await failureOf(
        call(
          bulkDeleteCouponsImpl,
          {
            storeSlug: "mawifoods",
            couponIds: [unlinked.id, linked.id, randomUUID()],
          },
          { context: { reqHeaders } },
        ),
      );

      expect(failure.code).toBe("NOT_FOUND");
      // The earlier hard delete and archive were both undone.
      expect(couponById(unlinked.id)?.deletedAt).toBeNull();
      expect(couponById(linked.id)?.deletedAt).toBeNull();
      expect(couponById(linked.id)?.status).toBe("active");
    });
  });

  describe("panel.setCouponStatus", () => {
    test("turns an active coupon off", async () => {
      const reqHeaders = await ownerCookie();
      const coupon = seedCoupon({ code: "DESLIGAR", status: "active" });

      const result = await call(
        setCouponStatusImpl,
        { storeSlug: "mawifoods", couponId: coupon.id, status: "disabled" },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ success: true });
      expect(couponById(coupon.id)?.status).toBe("disabled");
    });

    test("turns a disabled coupon back on", async () => {
      const reqHeaders = await ownerCookie();
      const coupon = seedCoupon({ code: "LIGAR", status: "disabled" });

      const result = await call(
        setCouponStatusImpl,
        { storeSlug: "mawifoods", couponId: coupon.id, status: "active" },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ success: true });
      expect(couponById(coupon.id)?.status).toBe("active");
    });

    test("refuses to activate a coupon whose window already closed", async () => {
      const reqHeaders = await ownerCookie();

      const coupon = seedCoupon({
        code: "VENCIDO",
        status: "disabled",
        endsAt: at("2020-01-31T23:59:59.999"),
      });

      const failure = await failureOf(
        call(
          setCouponStatusImpl,
          { storeSlug: "mawifoods", couponId: coupon.id, status: "active" },
          { context: { reqHeaders } },
        ),
      );

      expect(failure.message).toContain("já expirou");
      // Nothing was written: the row keeps the status it had.
      expect(couponById(coupon.id)?.status).toBe("disabled");
    });

    test("stores `disabled` when a closed coupon is turned off", async () => {
      const reqHeaders = await ownerCookie();

      const coupon = seedCoupon({
        code: "FECHADO",
        status: "active",
        endsAt: at("2020-01-31T23:59:59.999"),
      });

      await call(
        setCouponStatusImpl,
        { storeSlug: "mawifoods", couponId: coupon.id, status: "disabled" },
        { context: { reqHeaders } },
      );

      expect(couponById(coupon.id)?.status).toBe("disabled");
    });

    test("reads the stored window as a z-less wall clock", async () => {
      const reqHeaders = await ownerCookie();

      // `resolveCouponStatus` takes the stored column, which carries no `Z`; the
      // panel wire format's `toPanelTimestamp` output would throw here.
      const coupon = seedCoupon({
        code: "NO-FUTURO",
        status: "disabled",
        endsAt: at("2099-12-31T23:59:59.999"),
      });

      const result = await call(
        setCouponStatusImpl,
        { storeSlug: "mawifoods", couponId: coupon.id, status: "active" },
        { context: { reqHeaders } },
      );

      expect(result).toEqual({ success: true });
      expect(couponById(coupon.id)?.status).toBe("active");
    });

    test("a coupon from another store is NOT_FOUND", async () => {
      const reqHeaders = await ownerCookie();
      const coupon = seedCoupon({ code: "DE-OUTRO", tenantId: OTHER_TENANT_ID });

      const failure = await failureOf(
        call(
          setCouponStatusImpl,
          { storeSlug: "mawifoods", couponId: coupon.id, status: "disabled" },
          { context: { reqHeaders } },
        ),
      );

      expect(failure.code).toBe("NOT_FOUND");
      expect(couponById(coupon.id)?.status).toBe("active");
    });

    test("staff cannot write coupons", async () => {
      const reqHeaders = await staffCookie();
      const coupon = seedCoupon({ code: "SO-LEITURA" });

      const failure = await failureOf(
        call(
          setCouponStatusImpl,
          { storeSlug: "mawifoods", couponId: coupon.id, status: "disabled" },
          { context: { reqHeaders } },
        ),
      );

      expect(failure.code).toBe("FORBIDDEN");
    });
  });

  describe("panel reads hide archived coupons", () => {
    test("listCoupons hides a soft-deleted coupon", async () => {
      const reqHeaders = await ownerCookie();
      const visible = seedCoupon({ code: "VIVO" });

      const archived = seedCoupon({
        code: "ARQUIVADO-LISTA",
        status: "disabled",
        deletedAt: at("2026-01-02 00:00"),
      });

      const result = await call(
        listCouponsImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      const codes = result.coupons.map((coupon) => coupon.code);

      expect(codes).toContain(visible.code);
      expect(codes).not.toContain(archived.code);
    });

    test("listCouponSummaries hides a soft-deleted coupon", async () => {
      const reqHeaders = await ownerCookie();
      const visible = seedCoupon({ code: "VIVO-RESUMO" });

      const archived = seedCoupon({
        code: "ARQUIVADO-RESUMO",
        status: "disabled",
        deletedAt: at("2026-01-02 00:00"),
      });

      const result = await call(
        listCouponSummariesImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      const codes = result.coupons.map((coupon) => coupon.code);

      expect(codes).toContain(visible.code);
      expect(codes).not.toContain(archived.code);
    });

    test("getCouponDetail treats a soft-deleted coupon as gone", async () => {
      const reqHeaders = await ownerCookie();

      const archived = seedCoupon({
        code: "ARQUIVADO-DETALHE",
        status: "disabled",
        deletedAt: at("2026-01-02 00:00"),
      });

      const failure = await failureOf(
        call(
          getCouponDetailImpl,
          { storeSlug: "mawifoods", couponId: archived.id },
          { context: { reqHeaders } },
        ),
      );

      expect(failure.code).toBe("NOT_FOUND");
    });
  });
});
