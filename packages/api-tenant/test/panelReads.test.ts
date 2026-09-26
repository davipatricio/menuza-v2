/* eslint-disable anti-slop/no-chained-type-assertions */
/**
 * Panel read procedures — Unit (infrastructure-free), MEN-225.
 *
 * The point of these tests is the guard, not the data: a non-member must get
 * NOT_FOUND for every listing, and a member must only ever see their own
 * tenant's rows. The db is faked the same way `session.test.ts` fakes it, so no
 * infrastructure is needed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { db } from "@menuza/db";
import { hashPassword } from "@menuza/orpc-server/auth";
import { loginImpl } from "../src/domains/tenant/subdomains/session/login.impl.ts";
import { listOrdersImpl } from "../src/domains/tenant/subdomains/panel/listOrders.impl.ts";
import { getOrderImpl } from "../src/domains/tenant/subdomains/panel/getOrder.impl.ts";
import { listCustomersImpl } from "../src/domains/tenant/subdomains/panel/listCustomers.impl.ts";
import { getCustomerImpl } from "../src/domains/tenant/subdomains/panel/getCustomer.impl.ts";
import { listProductsImpl } from "../src/domains/tenant/subdomains/panel/listProducts.impl.ts";
import { listCategoriesImpl } from "../src/domains/tenant/subdomains/panel/listCategories.impl.ts";
import { listCouponsImpl } from "../src/domains/tenant/subdomains/panel/listCoupons.impl.ts";
import { listAuditLogsImpl } from "../src/domains/tenant/subdomains/panel/listAuditLogs.impl.ts";

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

interface CustomerRow {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string;
}

interface OrderRow {
  id: string;
  tenantId: string;
  code: string;
  customerId: string;
  totalCents: number;
  status: string;
  createdAt: Temporal.PlainDateTime;
}

interface ProductRow {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  available: boolean;
  sortOrder: number;
}

interface CategoryRow {
  id: string;
  tenantId: string;
  name: string;
  sortOrder: number;
}

interface VariationRow {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  priceCents: number;
  stockMode: string;
  stockQty: number | null;
}

interface CouponRow {
  id: string;
  tenantId: string;
  code: string;
  discountType: string;
  value: number;
  usageCount: number;
  status: string;
}

interface AuditLogRow {
  id: string;
  tenantId: string;
  action: string;
  actor: string;
  target: string;
  ip: string;
  createdAt: Temporal.PlainDateTime;
}

// Minimal in-memory stand-ins for the models the procedures read, mirroring
// `session.test.ts`. Only the query surface those procedures touch is
// implemented; the real Prisma model types are far wider and
// infrastructure-backed.
const members: MemberRow[] = [];

const tenants: TenantRow[] = [];

const memberships: MembershipRow[] = [];

const sessions: SessionRow[] = [];

const customers: CustomerRow[] = [];

const orders: OrderRow[] = [];

const products: ProductRow[] = [];

const categories: CategoryRow[] = [];

const variations: VariationRow[] = [];

const coupons: CouponRow[] = [];

const auditLogs: AuditLogRow[] = [];

// SAFETY: Captured once, before `installFakes` overwrites the model accessors;
// the query builders are read back verbatim on restore.
const originals = {
  memberWhere: db.orm.public.Member.where,
  tenantWhere: db.orm.public.Tenant.where,
  membershipWhere: db.orm.public.TenantMembership.where,
  sessionWhere: db.orm.public.Session.where,
  sessionCreate: db.orm.public.Session.create,
  customerWhere: db.orm.public.Customer.where,
  orderWhere: db.orm.public.Order.where,
  productWhere: db.orm.public.Product.where,
  categoryWhere: db.orm.public.Category.where,
  couponWhere: db.orm.public.Coupon.where,
  auditWhere: db.orm.public.AuditLog.where,
};

// SAFETY: Distinct random ids, so no fixture can collide with another's row.
const MEMBER_ID = randomUUID();

const OTHER_MEMBER_ID = randomUUID();

const TENANT_ID = randomUUID();

const OTHER_TENANT_ID = randomUUID();

const CUSTOMER_ID = randomUUID();

const OTHER_CUSTOMER_ID = randomUUID();

const COOKIE_NAME = "menuza_tenant_sid";

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

/**
 * A chainable no-op. The procedures chain `.where().select().orderBy().all()`,
 * and each call returns a fresh builder, so the fakes only have to answer the
 * terminal they are actually reached with.
 */
function rows<T>(source: T[]) {
  return {
    select: () => rows(source),
    include: () => rows(source),
    orderBy: () => rows(source),
    all: async () => source,
    first: async () => source[0] ?? null,
  };
}

/**
 * The shape of the `where` filter the panel reads pass. Every one of them keys
 * on `tenantId` — that is the tenant-isolation contract — plus at most one
 * natural key.
 */
interface TenantFilter {
  tenantId: string;
  code?: string;
  customerId?: string;
}

/** Joins the relation the procedures eagerly load, keyed the same way. */
function withCustomer<T extends { customerId: string }>(source: T[]) {
  return source.map((row) => {
    const customer = customers.find((c) => c.id === row.customerId);

    return { ...row, customer: customer ? { id: customer.id, name: customer.name } : null };
  });
}

function byTenant<T extends { tenantId: string }>(source: T[], filter: TenantFilter): T[] {
  return source.filter((row) => row.tenantId === filter.tenantId);
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

  // SAFETY: Mocking TenantMembership.where; `.first()` and `.all()` by member/tenant.
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

  // SAFETY: Mocking Session.where; sessions are keyed by the token digest, so
  // `.first()` matches on the already-hashed `filter.id`.
  db.orm.public.Session.where = ((filter: { id: string }) => ({
    first: async () => sessions.find((row) => row.id === filter.id) ?? null,
    updateAll: async (data: {
      revokedAt?: Temporal.PlainDateTime;
      lastUsedAt?: Temporal.PlainDateTime;
    }) => {
      for (const row of sessions) {
        if (row.id !== filter.id) continue;

        if (data.revokedAt) row.revokedAt = data.revokedAt;

        if (data.lastUsedAt) row.lastUsedAt = data.lastUsedAt;
      }
    },
  })) as any;

  // SAFETY: Mocking Session.create; appends the row login writes.
  db.orm.public.Session.create = (async (data: SessionRow) => {
    sessions.push(data);

    return data;
  }) as any;

  // SAFETY: Mocking Customer.where; the panel lists and filters by tenant.
  db.orm.public.Customer.where = ((filter: TenantFilter) =>
    rows(byTenant(customers, filter))) as any;

  // SAFETY: Mocking Order.where; the panel filters by tenant and by code/customer.
  db.orm.public.Order.where = ((filter: TenantFilter) =>
    rows(
      withCustomer(
        orders.filter(
          (row) =>
            row.tenantId === filter.tenantId &&
            (filter.code === undefined || row.code === filter.code) &&
            (filter.customerId === undefined || row.customerId === filter.customerId),
        ),
      ),
    )) as any;

  // SAFETY: Mocking Product.where; `.include()` attaches the category and the
  // variations, both filtered to the same tenant.
  db.orm.public.Product.where = ((filter: TenantFilter) => {
    const source = byTenant(products, filter);

    const withRelations = () =>
      source.map((product) => ({
        ...product,
        category: categories.find((c) => c.id === product.categoryId) ?? null,
        variations: variations.filter(
          (v) => v.tenantId === filter.tenantId && v.productId === product.id,
        ),
      }));

    return {
      // The panel chains two `.include()` calls (category, variations) before
      // ordering, so the joined shape is produced on the first one and kept.
      include: () => rows(withRelations()),
      // The category tab counts by selecting just the foreign key, with no
      // relation loaded.
      select: () => rows(source),
      all: async () => source,
      first: async () => source[0] ?? null,
    };
  }) as any;

  // SAFETY: Mocking Category.where; the panel orders by sortOrder.
  db.orm.public.Category.where = ((filter: TenantFilter) =>
    rows(byTenant(categories, filter))) as any;

  // SAFETY: Mocking Coupon.where; the panel orders by code.
  db.orm.public.Coupon.where = ((filter: TenantFilter) => rows(byTenant(coupons, filter))) as any;

  // SAFETY: Mocking AuditLog.where; the panel orders by createdAt.
  db.orm.public.AuditLog.where = ((filter: TenantFilter) =>
    rows(byTenant(auditLogs, filter))) as any;
}

function restoreFakes() {
  db.orm.public.Member.where = originals.memberWhere;
  db.orm.public.Tenant.where = originals.tenantWhere;
  db.orm.public.TenantMembership.where = originals.membershipWhere;
  db.orm.public.Session.where = originals.sessionWhere;
  db.orm.public.Session.create = originals.sessionCreate;
  db.orm.public.Customer.where = originals.customerWhere;
  db.orm.public.Order.where = originals.orderWhere;
  db.orm.public.Product.where = originals.productWhere;
  db.orm.public.Category.where = originals.categoryWhere;
  db.orm.public.Coupon.where = originals.couponWhere;
  db.orm.public.AuditLog.where = originals.auditWhere;
}

function cookieHeader(token: string): Headers {
  return new Headers({ cookie: `${COOKIE_NAME}=${token}` });
}

function cookieToken(resHeaders: Headers): string {
  const match = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(resHeaders.get("set-cookie") ?? "");

  return match?.[1] ?? "";
}

async function sessionCookie(): Promise<Headers> {
  const resHeaders = new Headers();

  await call(
    loginImpl,
    { email: "marina@menuza.local", password: "senha-correta" },
    { context: { resHeaders, reqHeaders: new Headers() } },
  );

  return cookieHeader(cookieToken(resHeaders));
}

/**
 * Every read procedure, paired with an input builder for it.
 *
 * The guard tests only care that the slug fails the membership check, but
 * `strictObject` rejects a missing `orderCode`/`customerId` first, so each read
 * is called with its own well-formed input. The identifiers are the ones the
 * fixtures declare; the guard runs before any of them is read.
 *
 * `call`'s overloads resolve against the union of the procedures, and a loop
 * over a heterogeneous array collapses to a signature none of them satisfies.
 * `ReadCall` is a stand-in for "some implemented read"; it is only ever reached
 * through `call` in a sibling describe, where the concrete procedure and its
 * own input are named and stay fully typed. The guard tests read no return
 * value, so `void` is the honest declared output.
 */
interface ReadInput {
  storeSlug: string;
  orderCode?: string;
  customerId?: string;
}

interface ReadCall {
  (input: ReadInput, context: { context: { reqHeaders: Headers } }): Promise<void>;
}

const guardRunner = (impl: (typeof READS)[number]["impl"]): ReadCall => {
  // SAFETY: the cast is only applied inside the guard tests, which assert the
  // thrown error code; no read's return value is consumed through it. It goes
  // through `call` rather than being invoked directly, so the contract's
  // output schema still validates whatever a passing read would have returned.
  return ((input: ReadInput, context: { context: { reqHeaders: Headers } }) =>
    call(impl as never, input, context as never)) as unknown as ReadCall;
};

const READS = [
  { name: "listOrders", impl: listOrdersImpl, input: (storeSlug: string) => ({ storeSlug }) },
  {
    name: "getOrder",
    impl: getOrderImpl,
    input: (storeSlug: string) => ({ storeSlug, orderCode: "ORD-101" }),
  },
  {
    name: "listCustomers",
    impl: listCustomersImpl,
    input: (storeSlug: string) => ({ storeSlug }),
  },
  {
    name: "getCustomer",
    impl: getCustomerImpl,
    input: (storeSlug: string) => ({ storeSlug, customerId: CUSTOMER_ID }),
  },
  {
    name: "listProducts",
    impl: listProductsImpl,
    input: (storeSlug: string) => ({ storeSlug }),
  },
  {
    name: "listCategories",
    impl: listCategoriesImpl,
    input: (storeSlug: string) => ({ storeSlug }),
  },
  {
    name: "listCoupons",
    impl: listCouponsImpl,
    input: (storeSlug: string) => ({ storeSlug }),
  },
  {
    name: "listAuditLogs",
    impl: listAuditLogsImpl,
    input: (storeSlug: string) => ({ storeSlug }),
  },
] as const;

describe("panel reads — Unit (infrastructure-free)", () => {
  beforeAll(async () => {
    installFakes();

    members.push({
      id: MEMBER_ID,
      email: "marina@menuza.local",
      name: "Marina Lopes",
      kind: "human",
      passwordHash: await hashPassword("senha-correta"),
      createdAt: at("2026-01-01 00:00"),
      updatedAt: at("2026-01-01 00:00"),
    });

    members.push({
      id: OTHER_MEMBER_ID,
      email: "bruna@menuza.local",
      name: "Bruna",
      kind: "human",
      passwordHash: null,
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
      memberId: MEMBER_ID,
      tenantId: TENANT_ID,
      role: "owner",
      createdAt: at("2026-01-01 00:00"),
    });

    customers.push({
      id: CUSTOMER_ID,
      tenantId: TENANT_ID,
      name: "Maria Silva",
      email: "maria@example.com",
      phone: "+55 11 98888-1111",
    });

    customers.push({
      id: OTHER_CUSTOMER_ID,
      tenantId: OTHER_TENANT_ID,
      name: "Fulano de Outro",
      email: "fulano@outro.local",
      phone: "+55 11 90000-0000",
    });

    orders.push({
      id: randomUUID(),
      tenantId: TENANT_ID,
      code: "ORD-101",
      customerId: CUSTOMER_ID,
      totalCents: 14550,
      status: "ready",
      createdAt: at("2026-09-20 12:30"),
    });

    orders.push({
      id: randomUUID(),
      tenantId: OTHER_TENANT_ID,
      code: "ORD-999",
      customerId: OTHER_CUSTOMER_ID,
      totalCents: 99900,
      status: "pending",
      createdAt: at("2026-09-20 13:00"),
    });

    const categoryId = randomUUID();

    categories.push({
      id: categoryId,
      tenantId: TENANT_ID,
      name: "Marmitas",
      sortOrder: 1,
    });

    const productId = randomUUID();

    products.push({
      id: productId,
      tenantId: TENANT_ID,
      name: "Marmita frango grelhado",
      description: null,
      categoryId,
      available: true,
      sortOrder: 1,
    });

    variations.push({
      id: randomUUID(),
      tenantId: TENANT_ID,
      productId,
      name: "default",
      priceCents: 2490,
      stockMode: "unlimited",
      stockQty: null,
    });

    coupons.push({
      id: randomUUID(),
      tenantId: TENANT_ID,
      code: "QUERO20",
      discountType: "fixed",
      value: 2000,
      usageCount: 45,
      status: "active",
    });

    auditLogs.push({
      id: randomUUID(),
      tenantId: TENANT_ID,
      action: "COUPON_CREATE",
      actor: "gestor@menuza.com",
      target: "QUERO20",
      ip: "177.12.89.4",
      createdAt: at("2026-09-20 11:05"),
    });
  });

  afterAll(() => {
    restoreFakes();
  });

  describe("membership guard", () => {
    test("a store the caller does not belong to yields NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      for (const read of READS) {
        try {
          await guardRunner(read.impl)(read.input("loja-de-outro"), {
            context: { reqHeaders },
          });
          throw new Error(`expected ${read.name} to fail`);
        } catch (error) {
          // SAFETY: the guard only throws the shared NOT_FOUND code.
          expect((error as { code: string }).code, read.name).toBe("NOT_FOUND");
        }
      }
    });

    test("an unknown store yields NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      for (const read of READS) {
        try {
          await guardRunner(read.impl)(read.input("nao-existe"), { context: { reqHeaders } });
          throw new Error(`expected ${read.name} to fail`);
        } catch (error) {
          // SAFETY: the guard only throws the shared NOT_FOUND code.
          expect((error as { code: string }).code, read.name).toBe("NOT_FOUND");
        }
      }
    });

    test("no session yields UNAUTHORIZED", async () => {
      for (const read of READS) {
        try {
          await guardRunner(read.impl)(read.input("mawifoods"), {
            context: { reqHeaders: new Headers() },
          });
          throw new Error(`expected ${read.name} to fail`);
        } catch (error) {
          // SAFETY: requireSession only throws the shared UNAUTHORIZED code.
          expect((error as { code: string }).code, read.name).toBe("UNAUTHORIZED");
        }
      }
    });
  });

  describe("panel.listOrders", () => {
    test("returns only the caller's store, with cents and the customer name", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        listOrdersImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]).toMatchObject({
        code: "ORD-101",
        customerId: CUSTOMER_ID,
        customerName: "Maria Silva",
        totalCents: 14550,
        status: "ready",
      });
      // No cross-tenant leak: ORD-999 belongs to the other store.
      expect(result.orders.some((order) => order.code === "ORD-999")).toBe(false);
    });
  });

  describe("panel.getOrder", () => {
    test("finds an order by its code", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        getOrderImpl,
        { storeSlug: "mawifoods", orderCode: "ORD-101" },
        { context: { reqHeaders } },
      );

      expect(result.order.customerName).toBe("Maria Silva");
    });

    test("another store's order code is NOT_FOUND, not a leak", async () => {
      const reqHeaders = await sessionCookie();

      try {
        await call(
          getOrderImpl,
          { storeSlug: "mawifoods", orderCode: "ORD-999" },
          { context: { reqHeaders } },
        );
        throw new Error("expected getOrder to fail");
      } catch (error) {
        // SAFETY: getOrder only throws the shared NOT_FOUND code.
        expect((error as { code: string }).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("panel.listCustomers", () => {
    test("derives order count and total spent from that store's orders", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        listCustomersImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      expect(result.customers).toHaveLength(1);
      expect(result.customers[0]).toEqual({
        id: CUSTOMER_ID,
        name: "Maria Silva",
        email: "maria@example.com",
        phone: "+55 11 98888-1111",
        ordersCount: 1,
        totalSpentCents: 14550,
      });
    });
  });

  describe("panel.getCustomer", () => {
    test("returns the customer with their orders", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        getCustomerImpl,
        { storeSlug: "mawifoods", customerId: CUSTOMER_ID },
        { context: { reqHeaders } },
      );

      expect(result.customer.name).toBe("Maria Silva");
      expect(result.orders.map((order) => order.code)).toEqual(["ORD-101"]);
    });

    test("another store's customer id is NOT_FOUND", async () => {
      const reqHeaders = await sessionCookie();

      try {
        await call(
          getCustomerImpl,
          { storeSlug: "mawifoods", customerId: OTHER_CUSTOMER_ID },
          { context: { reqHeaders } },
        );
        throw new Error("expected getCustomer to fail");
      } catch (error) {
        // SAFETY: getCustomer only throws the shared NOT_FOUND code.
        expect((error as { code: string }).code).toBe("NOT_FOUND");
      }
    });
  });

  describe("panel.listProducts", () => {
    test("reports the default variation's price and the category name", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        listProductsImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      expect(result.products).toHaveLength(1);
      expect(result.products[0]).toMatchObject({
        name: "Marmita frango grelhado",
        categoryName: "Marmitas",
        priceCents: 2490,
        available: true,
      });
    });
  });

  describe("panel.listCategories", () => {
    test("counts the store's products per category", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        listCategoriesImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      // SAFETY: the fixture set declares exactly one category, and the previous
      // expectation has already checked that it exists.
      const only = categories[0]!;

      expect(only).toBeDefined();
      expect(result.categories).toEqual([{ id: only?.id, name: "Marmitas", itemsCount: 1 }]);
    });
  });

  describe("panel.listCoupons", () => {
    test("splits value into cents for a fixed discount", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        listCouponsImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      expect(result.coupons[0]).toMatchObject({
        code: "QUERO20",
        discountType: "fixed",
        valueCents: 2000,
        valuePercent: null,
      });
    });
  });

  describe("panel.listAuditLogs", () => {
    test("returns the store's trail", async () => {
      const reqHeaders = await sessionCookie();

      const result = await call(
        listAuditLogsImpl,
        { storeSlug: "mawifoods" },
        { context: { reqHeaders } },
      );

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0]).toMatchObject({ action: "COUPON_CREATE", target: "QUERO20" });
    });
  });
});
