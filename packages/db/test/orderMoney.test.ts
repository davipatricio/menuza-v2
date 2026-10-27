import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  db,
  releaseVariationStock,
  reserveVariationStock,
  unscoped,
  withTenant,
} from "../src/index.ts";

/**
 * The guarantees that live in the database: the money identity of an order,
 * the stock a controlled variation carries, and the tenant a join row belongs
 * to. Each one needs a real database, so the suite is skipped unless
 * `TEST_INTEGRATION` is set.
 */
describe.skipIf(!process.env.TEST_INTEGRATION)("Order money, stock and tenant guards", () => {
  const tenantId = randomUUID();

  const otherTenantId = randomUUID();

  const now = (): Temporal.PlainDateTime => Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  const customerId = randomUUID();

  const productId = randomUUID();

  const variationId = randomUUID();

  const otherTenantVariationId = randomUUID();

  const otherTenantTagId = randomUUID();

  beforeAll(async () => {
    await unscoped(async () => {
      await db.orm.public.Tenant.create({
        id: tenantId,
        slug: `money-${tenantId.slice(0, 8)}`,
        displayName: "Money",
        updatedAt: now(),
      });

      await db.orm.public.Tenant.create({
        id: otherTenantId,
        slug: `money-other-${otherTenantId.slice(0, 8)}`,
        displayName: "Money other",
        updatedAt: now(),
      });

      await db.orm.public.Customer.create({
        id: customerId,
        tenantId,
        name: "Buyer",
        email: `buyer-${tenantId.slice(0, 8)}@example.com`,
        phone: "000",
      });

      await db.orm.public.Product.create({
        id: productId,
        tenantId,
        name: "Controlled product",
        available: true,
        archived: false,
        hidden: false,
        private: false,
        sortOrder: 0,
        updatedAt: now(),
      });

      await db.orm.public.Variation.create({
        id: variationId,
        tenantId,
        productId,
        name: "default",
        priceCents: 1000,
        stockMode: "controlled",
        stockQty: 1,
      });

      const otherProductId = randomUUID();

      await db.orm.public.Product.create({
        id: otherProductId,
        tenantId: otherTenantId,
        name: "Other product",
        available: true,
        archived: false,
        hidden: false,
        private: false,
        sortOrder: 0,
        updatedAt: now(),
      });

      await db.orm.public.Variation.create({
        id: otherTenantVariationId,
        tenantId: otherTenantId,
        productId: otherProductId,
        name: "default",
        priceCents: 1000,
        stockMode: "unlimited",
        stockQty: null,
      });

      await db.orm.public.Tag.create({
        id: otherTenantTagId,
        tenantId: otherTenantId,
        name: "Other tag",
        isActive: true,
        updatedAt: now(),
      });
    });
  });

  afterAll(async () => {
    await unscoped(async () => {
      await db.orm.public.Tenant.where({ id: tenantId }).deleteAll();
      await db.orm.public.Tenant.where({ id: otherTenantId }).deleteAll();
    });
  });

  test("an order that spends wallet credit satisfies the money identity", async () => {
    await withTenant(tenantId, async () => {
      const order = await db.orm.public.Order.create({
        id: randomUUID(),
        tenantId,
        code: `MONEY-${tenantId.slice(0, 8)}`,
        customerId,
        subtotalCents: 5000,
        discountCents: 0,
        shippingCents: 0,
        walletAppliedCents: 800,
        cashbackCents: 0,
        totalCents: 4200,
        financialStatus: "awaiting_payment",
        fulfilmentStatus: "pending",
        createdAt: now(),
        updatedAt: now(),
      });

      expect(order.totalCents).toBe(4200);
    });
  });

  test("an order whose total leaves the wallet out is refused", async () => {
    await withTenant(tenantId, async () => {
      await expect(
        db.orm.public.Order.create({
          id: randomUUID(),
          tenantId,
          code: `MONEY-BAD-${tenantId.slice(0, 8)}`,
          customerId,
          subtotalCents: 5000,
          discountCents: 0,
          shippingCents: 0,
          walletAppliedCents: 800,
          cashbackCents: 0,
          totalCents: 5000,
          financialStatus: "awaiting_payment",
          fulfilmentStatus: "pending",
          createdAt: now(),
          updatedAt: now(),
        }),
      ).rejects.toThrow();
    });
  });

  test("two checkouts cannot take the same last controlled unit", async () => {
    await withTenant(tenantId, async () => {
      const take = () =>
        db.transaction(async (tx) => {
          const reserved = await reserveVariationStock(tx, tenantId, [
            { variationId, quantity: 1 },
          ]);

          return reserved.ok;
        });

      const results = await Promise.all([take(), take()]);

      expect(results.filter(Boolean)).toHaveLength(1);

      const variation = await db.orm.public.Variation.where({ tenantId, id: variationId }).first();

      expect(variation?.stockQty).toBe(0);
    });
  });

  test("releasing the stock gives the unit back", async () => {
    await withTenant(tenantId, async () => {
      await db.transaction(async (tx) => {
        await releaseVariationStock(tx, tenantId, [{ variationId, quantity: 1 }]);
      });

      const variation = await db.orm.public.Variation.where({ tenantId, id: variationId }).first();

      expect(variation?.stockQty).toBe(1);
    });
  });

  test("a join row whose parents do not share its tenant is refused", async () => {
    await withTenant(tenantId, async () => {
      await expect(
        db.orm.public.ProductTag.create({
          tenantId,
          productId,
          tagId: otherTenantTagId,
        }),
      ).rejects.toThrow(/does not match its parents/);
    });
  });
});
