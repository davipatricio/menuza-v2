import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  db,
  TENANT_SCOPED_MODELS,
  TenantIsolationError,
  unscoped,
  withTenant,
} from "../src/index.ts";

describe.skipIf(!process.env.TEST_INTEGRATION)("Tenant Isolation (fail-closed)", () => {
  const tenant1Id = randomUUID();
  const tenant2Id = randomUUID();

  beforeAll(async () => {
    // Seed two tenants
    await db.orm.public.Tenant.create({
      id: tenant1Id,
      slug: `tenant-iso-1-${tenant1Id.slice(0, 8)}`,
      displayName: "Tenant Isolation 1",
      updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    });

    await db.orm.public.Tenant.create({
      id: tenant2Id,
      slug: `tenant-iso-2-${tenant2Id.slice(0, 8)}`,
      displayName: "Tenant Isolation 2",
      updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    });

    // Seed domains for both
    await db.orm.public.Domain.create({
      id: randomUUID(),
      host: `t1-${tenant1Id.slice(0, 8)}.local`,
      tenantId: tenant1Id,
    });

    await db.orm.public.Domain.create({
      id: randomUUID(),
      host: `t2-${tenant2Id.slice(0, 8)}.local`,
      tenantId: tenant2Id,
    });
  });

  afterAll(async () => {
    // Clean up
    await unscoped(async () => {
      await db.orm.public.Domain.where({ tenantId: tenant1Id }).deleteAll();
      await db.orm.public.Domain.where({ tenantId: tenant2Id }).deleteAll();
      await db.orm.public.Tenant.where({ id: tenant1Id }).deleteAll();
      await db.orm.public.Tenant.where({ id: tenant2Id }).deleteAll();
    });
  });

  test("querying tenant-scoped model without where.tenantId throws in runtime", async () => {
    try {
      await db.orm.public.Domain.where({ host: `t1-${tenant1Id.slice(0, 8)}.local` }).first();
      expect.unreachable("expected TenantIsolationError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(TenantIsolationError);
      expect(err.message).toContain("without where.tenantId equality filter");
    }
  });

  test("querying tenant-scoped model with where.tenantId succeeds", async () => {
    const domain = await db.orm.public.Domain.where({
      tenantId: tenant1Id,
      host: `t1-${tenant1Id.slice(0, 8)}.local`,
    }).first();

    expect(domain).not.toBeNull();
    expect(domain?.tenantId).toBe(tenant1Id);
  });

  test("querying within withTenant matching tenantId succeeds", async () => {
    await withTenant(tenant1Id, async () => {
      const domain = await db.orm.public.Domain.where({
        tenantId: tenant1Id,
      }).first();

      expect(domain).not.toBeNull();
      expect(domain?.tenantId).toBe(tenant1Id);
    });
  });

  test("cross-tenant query within withTenant throws TenantIsolationError", async () => {
    await withTenant(tenant1Id, async () => {
      try {
        await db.orm.public.Domain.where({ tenantId: tenant2Id }).first();
        expect.unreachable("expected cross-tenant error");
      } catch (err: any) {
        expect(err).toBeInstanceOf(TenantIsolationError);
        expect(err.message).toContain("Cross-tenant access violation");
        expect(err.message).toContain(tenant2Id);
        expect(err.message).toContain(tenant1Id);
      }
    });
  });

  test("querying with neq operator on tenantId is rejected", async () => {
    await withTenant(tenant1Id, async () => {
      try {
        await db.orm.public.Domain.where((d) => d.tenantId.neq(tenant2Id)).all();
        expect.unreachable("expected operator rejection");
      } catch (err: any) {
        expect(err).toBeInstanceOf(TenantIsolationError);
      }
    });
  });

  test("updating row to transfer tenantId across tenants is rejected", async () => {
    await withTenant(tenant1Id, async () => {
      try {
        await db.orm.public.Domain.where({ tenantId: tenant1Id }).updateAll({
          tenantId: tenant2Id,
        });
        expect.unreachable("expected update transfer rejection");
      } catch (err: any) {
        expect(err).toBeInstanceOf(TenantIsolationError);
        expect(err.message).toContain("cannot reassign tenantId");
      }
    });
  });

  test("inserting tenant-scoped model with mismatched tenantId within withTenant throws", async () => {
    await withTenant(tenant1Id, async () => {
      try {
        await db.orm.public.Domain.create({
          id: randomUUID(),
          host: "cross-tenant-host.local",
          tenantId: tenant2Id,
        });
        expect.unreachable("expected cross-tenant insert error");
      } catch (err: any) {
        expect(err).toBeInstanceOf(TenantIsolationError);
        expect(err.message).toContain("Cross-tenant access violation");
      }
    });
  });

  test("unscoped escape hatch permits global queries without tenantId", async () => {
    const domain = await unscoped(async () => {
      return db.orm.public.Domain.where({ host: `t2-${tenant2Id.slice(0, 8)}.local` }).first();
    });

    expect(domain).not.toBeNull();
    expect(domain?.tenantId).toBe(tenant2Id);
  });

  test("unscoped() awaits a sync callback's query inside the scope", async () => {
    // Regression: a sync callback returns Prisma's thenable. The scope must still
    // be active when the query is consumed, or the isolation middleware sees no
    // `unscoped()` and rejects the missing tenantId filter.
    const domains = await unscoped(() =>
      db.orm.public.Domain.where({ host: `t2-${tenant2Id.slice(0, 8)}.local` }).all(),
    );

    expect(domains).toHaveLength(1);
    expect(domains[0]?.tenantId).toBe(tenant2Id);
  });

  test("withTenant() enforces the scope for a sync callback's query", async () => {
    // Regression: same ALS consumption point as above; without the fix the
    // mismatched tenantId would not be caught.
    await expect(
      withTenant(tenant1Id, () => db.orm.public.Domain.where({ tenantId: tenant2Id }).all()),
    ).rejects.toThrow(TenantIsolationError);
  });

  test("global non-tenant-scoped models are not blocked", async () => {
    const tenant = await db.orm.public.Tenant.where({ id: tenant1Id }).first();

    expect(tenant).not.toBeNull();
    expect(tenant?.id).toBe(tenant1Id);
  });

  // MEN-225: the commerce base models are tenant-scoped purely by having a
  // `tenantId` field, which `TENANT_SCOPED_MODELS` derives from the contract.
  // A new model that forgets it would be silently global, so the derivation
  // itself is pinned here.
  test("every commerce base model is derived as tenant-scoped", () => {
    for (const model of [
      "Category",
      "Product",
      "Variation",
      "Kit",
      "KitItem",
      "Customer",
      "Order",
      "Coupon",
      "AuditLog",
      "MealSubscription",
    ]) {
      expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
    }
  });

  test("querying a commerce model without where.tenantId throws", async () => {
    try {
      await db.orm.public.Product.where({ name: "qualquer" }).first();
      expect.unreachable("expected TenantIsolationError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(TenantIsolationError);
      expect(err.message).toContain("without where.tenantId equality filter");
    }
  });

  test("querying a commerce model with where.tenantId succeeds", async () => {
    const products = await withTenant(tenant1Id, () =>
      db.orm.public.Product.where({ tenantId: tenant1Id }).all(),
    );

    expect(products).toEqual([]);
  });
});
