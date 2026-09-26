/**
 * Commerce fixture checks against a real database (MEN-225).
 *
 * Reads what `prisma/seed.ts` wrote rather than re-running it, so it asserts
 * the state the dashboard actually sees. Requires `bun run db:seed` first.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { db, unscoped } from "@menuza/db";

async function tenantIdBySlug(slug: string): Promise<string | null> {
  const tenant = await unscoped(() => db.orm.public.Tenant.where({ slug }).first());

  return tenant?.id ?? null;
}

async function countAll(tenantId: string): Promise<Record<string, number>> {
  return await unscoped(async () => {
    const [
      categories,
      products,
      variations,
      kits,
      kitItems,
      customers,
      orders,
      coupons,
      logs,
      subs,
    ] = await Promise.all([
      db.orm.public.Category.where({ tenantId }).all(),
      db.orm.public.Product.where({ tenantId }).all(),
      db.orm.public.Variation.where({ tenantId }).all(),
      db.orm.public.Kit.where({ tenantId }).all(),
      db.orm.public.KitItem.where({ tenantId }).all(),
      db.orm.public.Customer.where({ tenantId }).all(),
      db.orm.public.Order.where({ tenantId }).all(),
      db.orm.public.Coupon.where({ tenantId }).all(),
      db.orm.public.AuditLog.where({ tenantId }).all(),
      db.orm.public.MealSubscription.where({ tenantId }).all(),
    ]);

    return {
      categories: categories.length,
      products: products.length,
      variations: variations.length,
      kits: kits.length,
      kitItems: kitItems.length,
      customers: customers.length,
      orders: orders.length,
      coupons: coupons.length,
      auditLogs: logs.length,
      mealSubscriptions: subs.length,
    };
  });
}

describe.skipIf(!process.env.TEST_INTEGRATION)("Commerce seed fixtures", () => {
  let mawifoods: string | null = null;
  let novaLoja: string | null = null;

  beforeAll(async () => {
    mawifoods = await tenantIdBySlug("mawifoods");
    novaLoja = await tenantIdBySlug("nova-loja");
  });

  test("both demo stores exist", () => {
    expect(mawifoods).not.toBeNull();
    expect(novaLoja).not.toBeNull();
  });

  test("mawifoods carries the full fixture set", async () => {
    // SAFETY: the previous test asserts the tenant exists.
    const counts = await countAll(mawifoods!);

    expect(counts).toEqual({
      categories: 3,
      products: 4,
      variations: 4,
      kits: 1,
      kitItems: 2,
      customers: 12,
      orders: 12,
      coupons: 4,
      auditLogs: 5,
      mealSubscriptions: 1,
    });
  });

  test("nova-loja is empty so the panel's empty states are reachable", async () => {
    // SAFETY: the first test asserts the tenant exists.
    const counts = await countAll(novaLoja!);

    for (const [model, count] of Object.entries(counts)) {
      expect(count, `${model} should be empty in nova-loja`).toBe(0);
    }
  });

  test("every seeded order points at a customer of the same store", async () => {
    // SAFETY: mawifoods exists per the first test.
    const { customers, orders } = await unscoped(async () => ({
      customers: await db.orm.public.Customer.where({ tenantId: mawifoods! }).all(),
      orders: await db.orm.public.Order.where({ tenantId: mawifoods! }).all(),
    }));

    const ids = new Set(customers.map((c) => c.id));

    for (const order of orders) {
      expect(ids.has(order.customerId)).toBe(true);
    }
  });

  test("the brownie is the one controlled, empty variation", async () => {
    // SAFETY: mawifoods exists per the first test.
    const variations = await unscoped(() =>
      db.orm.public.Variation.where({ tenantId: mawifoods! }).all(),
    );

    const controlled = variations.filter((v) => v.stockMode === "controlled");

    expect(controlled).toHaveLength(1);
    expect(controlled[0]?.stockQty).toBe(0);

    for (const variation of variations.filter((v) => v.stockMode === "unlimited")) {
      expect(variation.stockQty).toBeNull();
    }
  });

  test("every kit item names a variation of the same store", async () => {
    // SAFETY: mawifoods exists per the first test.
    const { kitItems, variations } = await unscoped(async () => ({
      kitItems: await db.orm.public.KitItem.where({ tenantId: mawifoods! }).all(),
      variations: await db.orm.public.Variation.where({ tenantId: mawifoods! }).all(),
    }));

    const ids = new Set(variations.map((v) => v.id));

    for (const item of kitItems) {
      expect(ids.has(item.variationId)).toBe(true);
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  test("mawifoods has the three-person team settings/team renders", async () => {
    // SAFETY: mawifoods exists per the first test.
    const memberships = await unscoped(() =>
      db.orm.public.TenantMembership.where({ tenantId: mawifoods! }).all(),
    );

    const roles = memberships.map((row) => row.role).sort();

    // owner (Marina) + admin (Rafael) + staff (Bianca). Two distinct roles
    // beyond owner is what makes the read-only team page worth looking at and
    // what gives the `team:read` gate something to refuse.
    expect(roles).toEqual(["admin", "owner", "staff"]);

    const memberIds = new Set(memberships.map((row) => row.memberId));

    expect(memberIds.size).toBe(memberships.length);
  });

  test("the seeded team members can actually verify a password", async () => {
    // A team row whose member has no password hash is a member who can never
    // log in, which the team page would happily display as a real colleague.
    // SAFETY: mawifoods exists per the first test.
    const memberships = await unscoped(() =>
      db.orm.public.TenantMembership.where({ tenantId: mawifoods! }).all(),
    );

    const members = await unscoped(() =>
      Promise.all(
        memberships.map((row) => db.orm.public.Member.where({ id: row.memberId }).first()),
      ),
    );

    for (const member of members) {
      expect(member).not.toBeNull();
      expect(member?.passwordHash, `${member?.email} should be able to log in`).not.toBeNull();
    }
  });

  test("re-running the seed would not duplicate rows", async () => {
    // The seed upserts on every declared unique, so a second run is a no-op.
    // Assert the shape that makes that true rather than re-running it here:
    // the natural keys the seed upserts on are all present and unique.
    // SAFETY: mawifoods exists per the first test.
    const { orders, customers, coupons } = await unscoped(async () => ({
      orders: await db.orm.public.Order.where({ tenantId: mawifoods! }).all(),
      customers: await db.orm.public.Customer.where({ tenantId: mawifoods! }).all(),
      coupons: await db.orm.public.Coupon.where({ tenantId: mawifoods! }).all(),
    }));

    expect(new Set(orders.map((o) => o.code)).size).toBe(orders.length);
    expect(new Set(customers.map((c) => c.email)).size).toBe(customers.length);
    expect(new Set(coupons.map((c) => c.code)).size).toBe(coupons.length);
  });
});

describe.skipIf(!process.env.TEST_INTEGRATION)("Tenant isolation covers commerce models", () => {
  test("a Product query without where.tenantId fails closed", async () => {
    const { TenantIsolationError } = await import("@menuza/db");

    try {
      await db.orm.public.Product.where({ name: "qualquer" }).first();
      expect.unreachable("expected TenantIsolationError");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TenantIsolationError);
    }
  });

  test("a Category query without where.tenantId fails closed", async () => {
    const { TenantIsolationError } = await import("@menuza/db");

    try {
      await db.orm.public.Category.where({ name: "qualquer" }).first();
      expect.unreachable("expected TenantIsolationError");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TenantIsolationError);
    }
  });
});
