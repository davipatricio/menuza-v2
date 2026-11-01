/**
 * `panel.search` — Integration (Postgres).
 *
 * The palette is one read over eight models, so the things worth proving are
 * the ones a fake cannot: the tenant filter really narrows Postgres, `ILIKE`
 * really is given an escaped pattern, the per-group `limit` really caps the
 * result, and the hrefs carry the requested store slug. Fixtures live in two
 * throwaway tenants and the cleanup drops them, so the suite is safe to run
 * against the shared local database.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call } from "@orpc/server";
import { db, unscoped, withTenant } from "@menuza/db";
import { hashPassword } from "@menuza/orpc-server/auth";
import { loginImpl } from "../src/domains/tenant/subdomains/session/login.impl.ts";
import { searchImpl } from "../src/domains/tenant/subdomains/panel/search.impl.ts";
import { setCouponStatusImpl } from "../src/domains/tenant/subdomains/panel/setCouponStatus.impl.ts";

const COOKIE_NAME = "menuza_tenant_sid";

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

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

describe.skipIf(!process.env.TEST_INTEGRATION)("panel.search — Integration (Postgres)", () => {
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();

  const ownerId = randomUUID();
  const staffId = randomUUID();

  const slugA = `search-a-${tenantAId.slice(0, 8)}`;
  const slugB = `search-b-${tenantBId.slice(0, 8)}`;

  const ownerEmail = `search-owner-${ownerId.slice(0, 8)}@menuza.local`;
  const staffEmail = `search-staff-${staffId.slice(0, 8)}@menuza.local`;

  // The same row names in both tenants: a leak would show up as the other
  // store's id in the result, not as an obviously foreign label.
  const cafeProductAId = randomUUID();
  const cafeProductBId = randomUUID();

  const customerAId = randomUUID();
  const customerBId = randomUUID();

  const couponAId = randomUUID();
  const couponBId = randomUUID();

  // Soft-deleted in tenant A: its code matches the query, so only the filter
  // keeps it out of the palette.
  const deletedCouponAId = randomUUID();

  const categoryId = randomUUID();
  const categoryBId = randomUUID();
  const tagAId = randomUUID();
  const tagBId = randomUUID();
  const departmentAId = randomUUID();
  const departmentBId = randomUUID();
  const badgeAId = randomUUID();
  const badgeBId = randomUUID();
  const subcategoryAId = randomUUID();
  const subcategoryBId = randomUUID();

  // Eight products match `ca` as a substring and `Casa` is the only prefix
  // match; it sorts last by name, so only the ranked window returns it.
  const casaProductId = randomUUID();

  const cacauNames = [
    "Aveia com Cacau 1",
    "Aveia com Cacau 2",
    "Aveia com Cacau 3",
    "Aveia com Cacau 4",
    "Aveia com Cacau 5",
    "Aveia com Cacau 6",
  ];

  const validCouponId = randomUUID();
  const expiredCouponId = randomUUID();

  const boloNames = [
    "Bolo de Rolo 1",
    "Bolo de Rolo 2",
    "Bolo de Rolo 3",
    "Bolo de Rolo 4",
    "Bolo de Rolo 5",
    "Bolo de Rolo 6",
  ];

  const ownerCookie = () => cookieFor(ownerEmail);

  const staffCookie = () => cookieFor(staffEmail);

  const now = (): Temporal.PlainDateTime => Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  beforeAll(async () => {
    await unscoped(async () => {
      await db.orm.public.Tenant.create({
        id: tenantAId,
        slug: slugA,
        displayName: "Search A",
        updatedAt: now(),
      });

      await db.orm.public.Tenant.create({
        id: tenantBId,
        slug: slugB,
        displayName: "Search B",
        updatedAt: now(),
      });

      const passwordHash = await hashPassword("senha-correta");

      await db.orm.public.Member.create({
        id: ownerId,
        email: ownerEmail,
        name: "Owner",
        passwordHash,
        updatedAt: now(),
      });

      await db.orm.public.Member.create({
        id: staffId,
        email: staffEmail,
        name: "Staff",
        passwordHash,
        updatedAt: now(),
      });

      await db.orm.public.TenantMembership.create({
        id: randomUUID(),
        memberId: ownerId,
        tenantId: tenantAId,
        role: "owner",
      });

      await db.orm.public.TenantMembership.create({
        id: randomUUID(),
        memberId: staffId,
        tenantId: tenantAId,
        role: "staff",
      });

      await db.orm.public.Product.create({
        id: cafeProductAId,
        tenantId: tenantAId,
        name: "100% Café",
      });

      await db.orm.public.Product.create({
        id: cafeProductBId,
        tenantId: tenantBId,
        name: "100% Café",
      });

      for (const name of boloNames) {
        await db.orm.public.Product.create({
          id: randomUUID(),
          tenantId: tenantAId,
          name,
        });
      }

      await db.orm.public.Customer.create({
        id: customerAId,
        tenantId: tenantAId,
        name: "Cliente Café",
        email: `cliente-${tenantAId.slice(0, 8)}@loja-a.local`,
        phone: "+55 11 90000-0001",
      });

      await db.orm.public.Customer.create({
        id: customerBId,
        tenantId: tenantBId,
        name: "Cliente Café",
        email: `cliente-${tenantBId.slice(0, 8)}@loja-b.local`,
        phone: "+55 11 90000-0002",
      });

      await db.orm.public.Coupon.create({
        id: couponAId,
        tenantId: tenantAId,
        code: "CAFE10",
        discountType: "fixed",
        value: 1000,
      });

      await db.orm.public.Coupon.create({
        id: couponBId,
        tenantId: tenantBId,
        code: "CAFE10",
        discountType: "fixed",
        value: 1000,
      });

      await db.orm.public.Category.create({
        id: categoryId,
        tenantId: tenantAId,
        name: "Café & Cia",
      });

      // The taxonomy rows exist in both tenants under the same names, so the
      // isolation assertions can only pass if the tenant filter holds.
      await db.orm.public.Category.create({
        id: categoryBId,
        tenantId: tenantBId,
        name: "Café & Cia",
      });

      await db.orm.public.Subcategory.create({
        id: subcategoryAId,
        tenantId: tenantAId,
        categoryId,
        name: "Café",
      });

      await db.orm.public.Subcategory.create({
        id: subcategoryBId,
        tenantId: tenantBId,
        categoryId: categoryBId,
        name: "Café",
      });

      await db.orm.public.Tag.create({
        id: tagAId,
        tenantId: tenantAId,
        name: "Café",
      });

      await db.orm.public.Tag.create({
        id: tagBId,
        tenantId: tenantBId,
        name: "Café",
      });

      await db.orm.public.Department.create({
        id: departmentAId,
        tenantId: tenantAId,
        name: "Café",
      });

      await db.orm.public.Department.create({
        id: departmentBId,
        tenantId: tenantBId,
        name: "Café",
      });

      await db.orm.public.Badge.create({
        id: badgeAId,
        tenantId: tenantAId,
        name: "Café",
        imageUrl: "https://cdn.menuza.local/badge-cafe.svg",
      });

      await db.orm.public.Badge.create({
        id: badgeBId,
        tenantId: tenantBId,
        name: "Café",
        imageUrl: "https://cdn.menuza.local/badge-cafe.svg",
      });

      await db.orm.public.Product.create({
        id: casaProductId,
        tenantId: tenantAId,
        name: "Casa",
      });

      for (const name of cacauNames) {
        await db.orm.public.Product.create({
          id: randomUUID(),
          tenantId: tenantAId,
          name,
        });
      }

      await db.orm.public.Coupon.create({
        id: deletedCouponAId,
        tenantId: tenantAId,
        code: "CAFE-APAGADO",
        discountType: "fixed",
        value: 1000,
        deletedAt: at("2020-01-31T23:59:59.999"),
      });

      await db.orm.public.Coupon.create({
        id: validCouponId,
        tenantId: tenantAId,
        code: "DESLIGAVEL",
        discountType: "fixed",
        value: 500,
        status: "active",
      });

      await db.orm.public.Coupon.create({
        id: expiredCouponId,
        tenantId: tenantAId,
        code: "VENCIDO",
        discountType: "fixed",
        value: 500,
        status: "active",
        endsAt: at("2020-01-31T23:59:59.999"),
      });
    });
  });

  afterAll(async () => {
    await unscoped(async () => {
      await db.orm.public.TenantMembership.where({ memberId: ownerId }).deleteAll();
      await db.orm.public.TenantMembership.where({ memberId: staffId }).deleteAll();
      await db.orm.public.Session.where({ memberId: ownerId }).deleteAll();
      await db.orm.public.Session.where({ memberId: staffId }).deleteAll();
      await db.orm.public.Member.where({ id: ownerId }).deleteAll();
      await db.orm.public.Member.where({ id: staffId }).deleteAll();
      await db.orm.public.Tenant.where({ id: tenantAId }).deleteAll();
      await db.orm.public.Tenant.where({ id: tenantBId }).deleteAll();
    });
  });

  test("a term matching both stores returns only the caller's store", async () => {
    const reqHeaders = await ownerCookie();

    const byName = await call(
      searchImpl,
      { storeSlug: slugA, q: "Café" },
      { context: { reqHeaders } },
    );

    const ids = byName.groups.flatMap((group) => group.items.map((item) => item.id));

    expect(ids).toContain(cafeProductAId);
    expect(ids).toContain(customerAId);
    expect(ids).toContain(tagAId);
    expect(ids).toContain(categoryId);
    expect(ids).toContain(departmentAId);
    expect(ids).toContain(badgeAId);
    expect(ids).toContain(subcategoryAId);

    expect(ids).not.toContain(cafeProductBId);
    expect(ids).not.toContain(customerBId);
    expect(ids).not.toContain(tagBId);
    expect(ids).not.toContain(categoryBId);
    expect(ids).not.toContain(departmentBId);
    expect(ids).not.toContain(badgeBId);
    expect(ids).not.toContain(subcategoryBId);

    const byCode = await call(
      searchImpl,
      { storeSlug: slugA, q: "CAFE10" },
      { context: { reqHeaders } },
    );

    const couponIds = byCode.groups.flatMap((group) => group.items.map((item) => item.id));

    expect(couponIds).toContain(couponAId);
    expect(couponIds).not.toContain(couponBId);
  });

  test("a soft-deleted coupon is not a result", async () => {
    const reqHeaders = await ownerCookie();

    const result = await call(
      searchImpl,
      { storeSlug: slugA, q: "CAFE" },
      { context: { reqHeaders } },
    );

    const ids = result.groups.flatMap((group) => group.items.map((item) => item.id));

    expect(ids).toContain(couponAId);
    expect(ids).not.toContain(deletedCouponAId);
  });

  test("an owner of one store cannot search another store", async () => {
    const reqHeaders = await ownerCookie();

    const failure = await failureOf(
      call(searchImpl, { storeSlug: slugB, q: "Café" }, { context: { reqHeaders } }),
    );

    expect(failure.code).toBe("NOT_FOUND");
  });

  test("the product group is capped at five rows", async () => {
    const reqHeaders = await ownerCookie();

    const result = await call(
      searchImpl,
      { storeSlug: slugA, q: "Bolo" },
      { context: { reqHeaders } },
    );

    const products = result.groups.find((group) => group.kind === "product");

    expect(products?.items).toHaveLength(5);
  });

  test("a prefix match survives the wider window", async () => {
    const reqHeaders = await ownerCookie();

    const result = await call(
      searchImpl,
      { storeSlug: slugA, q: "ca" },
      { context: { reqHeaders } },
    );

    const products = result.groups.find((group) => group.kind === "product");
    const ids = products?.items.map((item) => item.id) ?? [];

    expect(products?.items).toHaveLength(5);
    expect(ids).toContain(casaProductId);
  });

  test("every row carries the requested store's href", async () => {
    const reqHeaders = await ownerCookie();

    const productResult = await call(
      searchImpl,
      { storeSlug: slugA, q: "100%" },
      { context: { reqHeaders } },
    );

    expect(productResult.groups[0]?.items[0]).toMatchObject({
      kind: "product",
      id: cafeProductAId,
      label: "100% Café",
      href: `/dashboard/${slugA}/catalog/products/${cafeProductAId}`,
    });

    const couponResult = await call(
      searchImpl,
      { storeSlug: slugA, q: "CAFE10" },
      { context: { reqHeaders } },
    );

    expect(couponResult.groups[0]?.items[0]).toMatchObject({
      kind: "coupon",
      id: couponAId,
      label: "CAFE10",
      href: `/dashboard/${slugA}/coupons/${couponAId}`,
    });

    const customerResult = await call(
      searchImpl,
      { storeSlug: slugA, q: "Cliente" },
      { context: { reqHeaders } },
    );

    expect(customerResult.groups[0]?.items[0]).toMatchObject({
      kind: "customer",
      id: customerAId,
      label: "Cliente Café",
      href: `/dashboard/${slugA}/customers/${customerAId}`,
    });

    const taxonomyResult = await call(
      searchImpl,
      { storeSlug: slugA, q: "Café &" },
      { context: { reqHeaders } },
    );

    expect(taxonomyResult.groups[0]?.items[0]).toMatchObject({
      kind: "category",
      id: categoryId,
      label: "Café & Cia",
      href: `/dashboard/${slugA}/catalog/categories?q=${encodeURIComponent("Café & Cia")}`,
    });
  });

  test("an owner may write", async () => {
    const reqHeaders = await ownerCookie();

    const result = await call(
      searchImpl,
      { storeSlug: slugA, q: "Bolo" },
      { context: { reqHeaders } },
    );

    expect(result.canWrite).toBe(true);
  });

  test("a staff member reads but may not write", async () => {
    const reqHeaders = await staffCookie();

    const result = await call(
      searchImpl,
      { storeSlug: slugA, q: "Bolo" },
      { context: { reqHeaders } },
    );

    expect(result.canWrite).toBe(false);
    expect(result.groups.find((group) => group.kind === "product")?.items).toHaveLength(5);
  });

  test("a literal percent is matched, not treated as a wildcard", async () => {
    const reqHeaders = await ownerCookie();

    const result = await call(
      searchImpl,
      { storeSlug: slugA, q: "100%" },
      { context: { reqHeaders } },
    );

    expect(result.groups[0]?.items[0]).toMatchObject({
      id: cafeProductAId,
      label: "100% Café",
    });
  });

  test("a query of two wildcards matches no row", async () => {
    const reqHeaders = await ownerCookie();

    const result = await call(
      searchImpl,
      { storeSlug: slugA, q: "%%" },
      { context: { reqHeaders } },
    );

    expect(result.groups).toHaveLength(0);
  });

  test("a bare percent is refused instead of listing everything", async () => {
    const reqHeaders = await ownerCookie();

    const failure = await failureOf(
      call(searchImpl, { storeSlug: slugA, q: "%" }, { context: { reqHeaders } }),
    );

    // `q` has a two-character minimum, so a lone wildcard never reaches
    // `likePattern`: oRPC rejects the input before the handler runs.
    expect(failure.code).toBe("BAD_REQUEST");
  });

  test("activating an expired coupon is refused", async () => {
    const reqHeaders = await ownerCookie();

    const failure = await failureOf(
      call(
        setCouponStatusImpl,
        { storeSlug: slugA, couponId: expiredCouponId, status: "active" },
        { context: { reqHeaders } },
      ),
    );

    expect(failure.code).toBe("VALIDATION_FAILED");
    expect(failure.message).toBe("O cupom já expirou: ajuste a data de término para ativá-lo.");
  });

  test("disabling a valid coupon succeeds", async () => {
    const reqHeaders = await ownerCookie();

    const result = await call(
      setCouponStatusImpl,
      { storeSlug: slugA, couponId: validCouponId, status: "disabled" },
      { context: { reqHeaders } },
    );

    expect(result).toEqual({ success: true });

    const stored = await withTenant(tenantAId, () =>
      db.orm.public.Coupon.where({ tenantId: tenantAId, id: validCouponId }).first(),
    );

    expect(stored?.status).toBe("disabled");
  });
});
