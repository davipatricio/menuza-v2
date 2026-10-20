/**
 * Local-only fixture command. Idempotent: re-running does not duplicate tenants
 * and does not reassign host→tenant ownership if the host already exists with a
 * different tenant (which would silently break multi-tenant isolation).
 *
 * WEB_HOST_MAP semantics: `host=mode` where mode is "landing"|"storefront"|"management".
 * Each unique host maps to exactly one tenant. Distinct storefront hosts are NOT
 * collapsed into a single tenant — the host itself identifies the tenant locally.
 *
 * Prisma 8 has no @default(cuid()) or @updatedAt: ids and updatedAt are set here
 * (updatedAt in UTC-naive to match the values the v7 client wrote).
 */
import { createHash, randomUUID } from "node:crypto";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "./generated/client/contract.ts";
import contractJson from "./generated/client/contract.json" with { type: "json" };

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("[db:seed] DATABASE_URL missing");
  process.exit(1);
}

const db = postgres<Contract>({ contractJson, url });

const map = (process.env.WEB_HOST_MAP ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

interface Entry {
  host: string;
  mode: string;
}

const parsed: Entry[] = [];

for (const entry of map) {
  const [host, mode] = entry.split("=");

  if (!host || !mode) continue;

  if (mode !== "landing" && mode !== "storefront" && mode !== "management") {
    console.error(`[db:seed] skipping invalid mode "${mode}" for host "${host}"`);
    continue;
  }

  parsed.push({ host, mode });
}

// One tenant per host (deduped by host so WEB_HOST_MAP duplicates don't thrash).
const hosts = new Map<string, Entry>();

for (const e of parsed) {
  if (!hosts.has(e.host)) hosts.set(e.host, e);
}

let created = 0;

let reused = 0;

let conflicts = 0;

for (const { host, mode } of hosts.values()) {
  const existing = await db.orm.public.Domain.where({ host }).include("tenant").first();

  if (existing) {
    // Preserve existing ownership. Only report.
    reused++;
    console.log(`[db:seed] ${host} → existing tenant "${existing.tenant.slug}" (kept)`);
    continue;
  }

  // New host. Slug derives from the host so distinct storefront hosts get distinct tenants.
  const slug = host.split(".")[0] ?? host;

  const tenant = await db.orm.public.Tenant.upsert({
    update: {},
    create: {
      id: randomUUID(),
      slug,
      displayName: slug,
      updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    },
    conflictOn: { slug },
  });

  await db.orm.public.Domain.create({
    id: randomUUID(),
    host,
    tenantId: tenant.id,
  });
  created++;
  console.log(`[db:seed] ${host} → tenant "${slug}" (${mode}) created`);
}

// --- Demo identity + tenancy (MEN-225) ---------------------------------------
//
// The dashboard renders a hardcoded "Marina Lopes" user and two mocked stores
// (mawifoods / nova-loja). This block sources that identity and tenancy from the
// database while WEB_HOST_MAP stays the authority for host → tenant resolution
// and ownership above (never reassigning a host that already belongs to another
// tenant). The demo stores are ensured independently by slug upsert so the
// dashboard picker works even when the map does not mention them; if a
// map-derived tenant already uses the slug, the upsert reuses it.
//
// Fixture only: these rows exist for local development. Never run this seed
// against a production database.
//
// Out of scope here: orders, customers, coupons, audit logs, products and
// categories are seeded further down, from the mockup's fixtures.

const DEMO_EMAIL = "marina@menuza.local";

// LOCAL FIXTURE ONLY — demo credential, must never reach production.
const DEMO_PASSWORD = "menuza-demo";

const now = () => Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

// Real demo identity backing the dashboard's MOCK_CURRENT_USER. Upserted by
// email so re-runs do not duplicate. Hashing mirrors @menuza/orpc-server/auth
// (argon2id, 64 MiB, t=3) without importing it; hash only when creating.
const memberBefore = await db.orm.public.Member.where({ email: DEMO_EMAIL }).first();

const demoMember = await db.orm.public.Member.upsert({
  update: {},
  create: {
    id: randomUUID(),
    email: DEMO_EMAIL,
    name: "Marina Lopes",
    kind: "human",
    passwordHash: memberBefore
      ? null
      : await Bun.password.hash(DEMO_PASSWORD, {
          algorithm: "argon2id",
          memoryCost: 65536,
          timeCost: 3,
        }),
    updatedAt: now(),
  },
  conflictOn: { email: DEMO_EMAIL },
});

console.log(
  `[db:seed] demo member "${demoMember.name ?? DEMO_EMAIL}" <${demoMember.email}> (${memberBefore ? "kept" : "created"})`,
);

const demoStores = [
  { slug: "mawifoods", displayName: "Mawifoods", role: "owner" },
  { slug: "nova-loja", displayName: "Nova Loja", role: "admin" },
] as const;

const demoTenantIds = new Map<string, string>();

for (const store of demoStores) {
  const tenantBefore = await db.orm.public.Tenant.where({ slug: store.slug }).first();

  const tenant = await db.orm.public.Tenant.upsert({
    update: {},
    create: {
      id: randomUUID(),
      slug: store.slug,
      displayName: store.displayName,
      updatedAt: now(),
    },
    conflictOn: { slug: store.slug },
  });

  demoTenantIds.set(store.slug, tenant.id);

  console.log(`[db:seed] demo store "${tenant.slug}" (${tenantBefore ? "kept" : "created"})`);

  // role is the canonical lowercase-ASCII closed set (owner|admin|staff). The
  // dashboard's "Proprietária"/"Administrador" strings are display labels only
  // and must never be written to the role column.
  const membershipBefore = await db.orm.public.TenantMembership.where({
    memberId: demoMember.id,
    tenantId: tenant.id,
  }).first();

  if (membershipBefore) {
    console.log(
      `[db:seed] membership ${DEMO_EMAIL} → ${store.slug} (${membershipBefore.role}, kept)`,
    );
    continue;
  }

  await db.orm.public.TenantMembership.create({
    id: randomUUID(),
    memberId: demoMember.id,
    tenantId: tenant.id,
    role: store.role,
  });

  console.log(`[db:seed] membership ${DEMO_EMAIL} → ${store.slug} (${store.role}, created)`);
}

// --- Commerce fixtures (MEN-225) ---------------------------------------------
//
// A 1:1 port of the dashboard mockup (`mock-dashboard-data.ts` before it was
// deleted): mawifoods carries the data, nova-loja stays empty so the panel's
// empty states are reachable. A store created through signup also stays empty —
// it must open the panel instead of 404ing.
//
// Every row is upserted on a declared unique constraint, or carries a
// deterministic id derived from its natural key, so re-running never duplicates.
// The seed runs unscoped on purpose (fixtures, not a request path).

/**
 * Deterministic UUID-shaped id from a natural key. Models without a declared
 * unique beyond `id` (Product, Kit, AuditLog, MealSubscription) use this so a
 * second run finds the same row instead of appending a duplicate.
 */
function stableId(scope: string, key: string): string {
  const hex = createHash("sha256").update(`${scope}:${key}`).digest("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

const mawifoodsId = demoTenantIds.get("mawifoods");

if (mawifoodsId) {
  const categoryFixtures = [
    { name: "Marmitas", sortOrder: 1 },
    { name: "Bebidas", sortOrder: 2 },
    { name: "Sobremesas", sortOrder: 3 },
  ] as const;

  const categoryIdByName = new Map<string, string>();

  for (const fixture of categoryFixtures) {
    const category = await db.orm.public.Category.upsert({
      create: {
        id: stableId("category", fixture.name),
        tenantId: mawifoodsId,
        name: fixture.name,
        sortOrder: fixture.sortOrder,
      },
      update: {},
      conflictOn: { tenantId: mawifoodsId, name: fixture.name },
    });

    categoryIdByName.set(fixture.name, category.id);
  }

  // priceCents is Int cents (ADR-0006); stockQty is null exactly when the
  // variation is unlimited. The brownie is the one controlled, empty product.
  const productFixtures = [
    { name: "Marmita frango grelhado", category: "Marmitas", priceCents: 2490, available: true },
    { name: "Marmita carne desfiada", category: "Marmitas", priceCents: 2790, available: true },
    { name: "Suco verde 500ml", category: "Bebidas", priceCents: 1200, available: true },
    { name: "Brownie low carb", category: "Sobremesas", priceCents: 950, available: false },
  ] as const;

  for (const [index, fixture] of productFixtures.entries()) {
    const productId = stableId("product", fixture.name);

    await db.orm.public.Product.upsert({
      create: {
        id: productId,
        tenantId: mawifoodsId,
        name: fixture.name,
        // SAFETY: every fixture category is one of the three seeded above.
        categoryId: categoryIdByName.get(fixture.category)!,
        available: fixture.available,
        sortOrder: index + 1,
      },
      update: {},
      conflictOn: { id: productId },
    });

    // A product with no real variant matrix still gets one row, named
    // "default" — that is where the price and the stock live (MEN-80/81).
    await db.orm.public.Variation.upsert({
      create: {
        id: stableId("variation", fixture.name),
        tenantId: mawifoodsId,
        productId,
        name: "default",
        priceCents: fixture.priceCents,
        stockMode: fixture.available ? "unlimited" : "controlled",
        stockQty: fixture.available ? null : 0,
      },
      update: {},
      conflictOn: { productId, name: "default" },
    });
  }

  // One pre-selected kit over two variations. A kit debits the variations it
  // names, never a stock of its own (MEN-83); the panel has no kit tab yet.
  const kitId = stableId("kit", "Kit da semana");

  await db.orm.public.Kit.upsert({
    create: {
      id: kitId,
      tenantId: mawifoodsId,
      name: "Kit da semana",
      mode: "preselected",
      available: true,
    },
    update: {},
    conflictOn: { id: kitId },
  });

  const kitItems = [
    { variation: "Marmita frango grelhado", quantity: 1 },
    { variation: "Suco verde 500ml", quantity: 1 },
  ] as const;

  for (const fixture of kitItems) {
    const variationId = stableId("variation", fixture.variation);

    await db.orm.public.KitItem.upsert({
      create: {
        id: stableId("kitItem", fixture.variation),
        tenantId: mawifoodsId,
        kitId,
        variationId,
        quantity: fixture.quantity,
      },
      update: {},
      conflictOn: { kitId, variationId },
    });
  }

  const customerFixtures = [
    { name: "Maria Silva", email: "maria@example.com", phone: "+55 11 98888-1111" },
    { name: "João Santos", email: "joao@example.com", phone: "+55 11 97777-2222" },
    { name: "Ana Souza", email: "ana@example.com", phone: "+55 21 96666-3333" },
    { name: "Carlos Lima", email: "carlos@example.com", phone: "+55 31 95555-4444" },
    { name: "Beatriz Costa", email: "beatriz@example.com", phone: "+55 41 94444-5555" },
    { name: "Lucas Ferreira", email: "lucas@example.com", phone: "+55 11 93333-6666" },
    { name: "Fernanda Rocha", email: "fernanda@example.com", phone: "+55 21 92222-7777" },
    { name: "Rafael Ramos", email: "rafael@example.com", phone: "+55 31 91111-8888" },
    { name: "Juliana Alves", email: "juliana@example.com", phone: "+55 41 90000-9999" },
    { name: "Rodrigo Mendes", email: "rodrigo@example.com", phone: "+55 11 98765-4321" },
    { name: "Paula Nogueira", email: "paula@example.com", phone: "+55 21 97654-3210" },
    { name: "Tiago Barros", email: "tiago@example.com", phone: "+55 31 96543-2109" },
  ] as const;

  const customerIdByEmail = new Map<string, string>();

  for (const fixture of customerFixtures) {
    const customer = await db.orm.public.Customer.upsert({
      create: {
        id: stableId("customer", fixture.email),
        tenantId: mawifoodsId,
        name: fixture.name,
        email: fixture.email,
        phone: fixture.phone,
      },
      update: {},
      conflictOn: { tenantId: mawifoodsId, email: fixture.email },
    });

    customerIdByEmail.set(fixture.email, customer.id);
  }

  // `value` is cents for a fixed discount and a whole percent for a percentage
  // one — the same Int column, read through discountType. Seeded before the
  // orders because `Order.couponId` names one of them, and `usageCount` is
  // derived from the redemptions seeded below so the two can never disagree.
  const couponFixtures = [
    { code: "BEMVINDO10", discountType: "percentage", value: 10, status: "active" },
    { code: "QUERO20", discountType: "fixed", value: 2000, status: "active" },
    { code: "BLACKFRIDAY", discountType: "percentage", value: 30, status: "expired" },
    { code: "TESTE", discountType: "fixed", value: 500, status: "disabled" },
  ] as const;

  const redemptionFixtures = [
    { code: "BEMVINDO10", orderCode: "ORD-101", email: "maria@example.com", discountCents: 618 },
    { code: "QUERO20", orderCode: "ORD-103", email: "ana@example.com", discountCents: 2000 },
    { code: "QUERO20", orderCode: "ORD-105", email: "beatriz@example.com", discountCents: 2000 },
  ] as const;

  const couponIdByCode = new Map<string, string>();

  for (const fixture of couponFixtures) {
    const usageCount = redemptionFixtures.filter((r) => r.code === fixture.code).length;

    const coupon = await db.orm.public.Coupon.upsert({
      create: {
        id: stableId("coupon", fixture.code),
        tenantId: mawifoodsId,
        code: fixture.code,
        discountType: fixture.discountType,
        value: fixture.value,
        usageCount,
        status: fixture.status,
      },
      update: {},
      conflictOn: { tenantId: mawifoodsId, code: fixture.code },
    });

    couponIdByCode.set(fixture.code, coupon.id);
  }

  // Two independent axes since MEN-93 split the old single `status`: money and
  // fulfilment move on their own timelines. The spread covers every financial
  // status the panel can show and most of the fulfilment ones. Money is derived
  // here — `subtotal` is the sum of the items, `total` is
  // `subtotal - discount + shipping` — because the contract's check enforces
  // exactly that arithmetic.
  const orderFixtures = [
    {
      code: "ORD-101",
      email: "maria@example.com",
      financialStatus: "paid",
      fulfilmentStatus: "ready",
      paymentMethod: "pix",
      at: "2026-09-20 12:30",
      paidAt: "2026-09-20 12:31",
      discountCents: 618,
      shippingCents: 0,
      cashbackCents: 145,
      walletAppliedCents: 0,
      couponCode: "BEMVINDO10",
      items: [
        { product: "Marmita frango grelhado", quantity: 2 },
        { product: "Suco verde 500ml", quantity: 1 },
      ],
    },
    {
      code: "ORD-102",
      email: "joao@example.com",
      financialStatus: "paid",
      fulfilmentStatus: "confirmed",
      paymentMethod: "credit",
      at: "2026-09-20 12:45",
      paidAt: "2026-09-20 12:46",
      discountCents: 500,
      shippingCents: 900,
      cashbackCents: 0,
      walletAppliedCents: 0,
      items: [
        { product: "Marmita carne desfiada", quantity: 2 },
        { product: "Brownie low carb", quantity: 1 },
      ],
    },
    {
      code: "ORD-103",
      email: "ana@example.com",
      financialStatus: "refunded",
      fulfilmentStatus: "completed",
      paymentMethod: "debit",
      at: "2026-09-20 11:15",
      paidAt: "2026-09-20 11:16",
      discountCents: 2000,
      shippingCents: 1500,
      cashbackCents: 0,
      walletAppliedCents: 0,
      couponCode: "QUERO20",
      items: [
        { product: "Marmita frango grelhado", quantity: 3 },
        { product: "Suco verde 500ml", quantity: 3 },
      ],
    },
    {
      code: "ORD-104",
      email: "carlos@example.com",
      financialStatus: "canceled",
      fulfilmentStatus: "canceled",
      paymentMethod: null,
      at: "2026-09-20 13:00",
      paidAt: null,
      discountCents: 0,
      shippingCents: 0,
      cashbackCents: 0,
      walletAppliedCents: 0,
      items: [{ product: "Marmita carne desfiada", quantity: 1 }],
    },
    {
      code: "ORD-105",
      email: "beatriz@example.com",
      financialStatus: "refunded",
      fulfilmentStatus: "canceled",
      paymentMethod: "pix",
      at: "2026-09-20 10:20",
      paidAt: "2026-09-20 10:21",
      discountCents: 2000,
      shippingCents: 0,
      cashbackCents: 0,
      walletAppliedCents: 0,
      couponCode: "QUERO20",
      items: [
        { product: "Marmita frango grelhado", quantity: 4 },
        { product: "Suco verde 500ml", quantity: 2 },
      ],
    },
    {
      code: "ORD-106",
      email: "lucas@example.com",
      financialStatus: "paid",
      fulfilmentStatus: "preparing",
      paymentMethod: "meal_voucher",
      at: "2026-09-20 13:10",
      paidAt: "2026-09-20 13:11",
      discountCents: 0,
      shippingCents: 0,
      cashbackCents: 95,
      walletAppliedCents: 0,
      items: [
        { product: "Marmita carne desfiada", quantity: 3 },
        { product: "Brownie low carb", quantity: 2 },
      ],
    },
    {
      code: "ORD-107",
      email: "fernanda@example.com",
      financialStatus: "paid",
      fulfilmentStatus: "ready",
      paymentMethod: "food_voucher",
      at: "2026-09-20 13:15",
      paidAt: "2026-09-20 13:16",
      discountCents: 1500,
      shippingCents: 1200,
      cashbackCents: 310,
      walletAppliedCents: 500,
      items: [
        { product: "Marmita frango grelhado", quantity: 5 },
        { product: "Marmita carne desfiada", quantity: 5 },
      ],
    },
    {
      code: "ORD-108",
      email: "rafael@example.com",
      financialStatus: "expired",
      fulfilmentStatus: "canceled",
      paymentMethod: "pix",
      at: "2026-09-20 13:20",
      paidAt: null,
      discountCents: 0,
      shippingCents: 0,
      cashbackCents: 0,
      walletAppliedCents: 0,
      items: [
        { product: "Marmita frango grelhado", quantity: 2 },
        { product: "Suco verde 500ml", quantity: 1 },
      ],
    },
    {
      code: "ORD-109",
      email: "juliana@example.com",
      financialStatus: "paid",
      fulfilmentStatus: "completed",
      paymentMethod: "credit",
      at: "2026-09-20 09:40",
      paidAt: "2026-09-20 09:41",
      discountCents: 1000,
      shippingCents: 0,
      cashbackCents: 178,
      walletAppliedCents: 0,
      items: [
        { product: "Marmita carne desfiada", quantity: 6 },
        { product: "Suco verde 500ml", quantity: 2 },
      ],
    },
    {
      code: "ORD-110",
      email: "rodrigo@example.com",
      financialStatus: "pending_on_delivery",
      fulfilmentStatus: "confirmed",
      paymentMethod: "cash_on_delivery",
      at: "2026-09-20 13:25",
      paidAt: null,
      discountCents: 0,
      shippingCents: 600,
      cashbackCents: 0,
      walletAppliedCents: 0,
      items: [
        { product: "Marmita frango grelhado", quantity: 1 },
        { product: "Brownie low carb", quantity: 1 },
      ],
    },
    {
      code: "ORD-111",
      email: "paula@example.com",
      financialStatus: "awaiting_payment",
      fulfilmentStatus: "pending",
      paymentMethod: "pix",
      at: "2026-09-20 13:30",
      paidAt: null,
      expiresAt: "2026-09-20 14:00",
      discountCents: 500,
      shippingCents: 0,
      cashbackCents: 0,
      walletAppliedCents: 0,
      items: [
        { product: "Marmita carne desfiada", quantity: 4 },
        { product: "Suco verde 500ml", quantity: 1 },
      ],
    },
    {
      code: "ORD-112",
      email: "tiago@example.com",
      financialStatus: "paid",
      fulfilmentStatus: "out_for_delivery",
      paymentMethod: "card_on_delivery",
      at: "2026-09-20 13:35",
      paidAt: "2026-09-20 13:36",
      discountCents: 0,
      shippingCents: 900,
      cashbackCents: 88,
      walletAppliedCents: 0,
      items: [
        { product: "Marmita frango grelhado", quantity: 2 },
        { product: "Marmita carne desfiada", quantity: 1 },
        { product: "Suco verde 500ml", quantity: 1 },
      ],
    },
  ] as const;

  const priceByProduct = new Map(productFixtures.map((p) => [p.name, p.priceCents]));

  for (const fixture of orderFixtures) {
    const orderId = stableId("order", fixture.code);

    const items = fixture.items.map((item, index) => {
      // SAFETY: every fixture item names one of the products seeded above.
      const unitPriceCents = priceByProduct.get(item.product)!;

      return {
        id: stableId("orderItem", `${fixture.code}:${index}`),
        name: item.product,
        productId: stableId("product", item.product),
        variationId: stableId("variation", item.product),
        unitPriceCents,
        quantity: item.quantity,
        lineTotalCents: unitPriceCents * item.quantity,
      };
    });

    const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

    const totalCents = subtotalCents - fixture.discountCents + fixture.shippingCents;

    const couponCode = "couponCode" in fixture ? fixture.couponCode : null;

    const couponId = couponCode ? (couponIdByCode.get(couponCode) ?? null) : null;

    await db.orm.public.Order.upsert({
      create: {
        id: orderId,
        tenantId: mawifoodsId,
        code: fixture.code,
        // SAFETY: every fixture email is one of the customers seeded above.
        customerId: customerIdByEmail.get(fixture.email)!,
        subtotalCents,
        discountCents: fixture.discountCents,
        shippingCents: fixture.shippingCents,
        walletAppliedCents: fixture.walletAppliedCents,
        cashbackCents: fixture.cashbackCents,
        totalCents,
        financialStatus: fixture.financialStatus,
        fulfilmentStatus: fixture.fulfilmentStatus,
        paymentMethod: fixture.paymentMethod,
        paidAt: fixture.paidAt ? Temporal.PlainDateTime.from(fixture.paidAt) : null,
        expiresAt: "expiresAt" in fixture ? Temporal.PlainDateTime.from(fixture.expiresAt) : null,
        couponId,
        createdAt: Temporal.PlainDateTime.from(fixture.at),
        updatedAt: Temporal.PlainDateTime.from(fixture.at),
      },
      update: {},
      conflictOn: { tenantId: mawifoodsId, code: fixture.code },
    });

    for (const item of items) {
      await db.orm.public.OrderItem.upsert({
        create: { ...item, tenantId: mawifoodsId, orderId },
        update: {},
        conflictOn: { id: item.id },
      });
    }

    // Append-only: the first event is the order being taken, the second the
    // money settling (or the payment awaiting/never arriving).
    const events = [
      { type: "fulfilment_changed", fromValue: null, toValue: fixture.fulfilmentStatus },
      { type: "financial_changed", fromValue: null, toValue: fixture.financialStatus },
    ] as const;

    for (const [index, event] of events.entries()) {
      const id = stableId("orderEvent", `${fixture.code}:${index}`);

      await db.orm.public.OrderEvent.upsert({
        create: {
          id,
          tenantId: mawifoodsId,
          orderId,
          type: event.type,
          fromValue: event.fromValue,
          toValue: event.toValue,
          createdAt: Temporal.PlainDateTime.from(fixture.at),
        },
        update: {},
        conflictOn: { id },
      });
    }
  }

  for (const fixture of redemptionFixtures) {
    const orderId = stableId("order", fixture.orderCode);
    // SAFETY: every redemption names a coupon and an order seeded above.
    const couponId = couponIdByCode.get(fixture.code)!;
    const customerId = customerIdByEmail.get(fixture.email)!;

    await db.orm.public.CouponRedemption.upsert({
      create: {
        id: stableId("couponRedemption", `${fixture.code}:${fixture.orderCode}`),
        tenantId: mawifoodsId,
        couponId,
        orderId,
        customerId,
        discountCents: fixture.discountCents,
      },
      update: {},
      conflictOn: { couponId, orderId },
    });
  }

  // Maria's wallet: the cashback the seeded orders earned, spent down by one
  // reserve. `balanceCents` is the rollup of the transactions below.
  const walletId = stableId("wallet", "maria@example.com");

  await db.orm.public.Wallet.upsert({
    create: {
      id: walletId,
      tenantId: mawifoodsId,
      // SAFETY: Maria's customer row is seeded above.
      customerId: customerIdByEmail.get("maria@example.com")!,
      balanceCents: 145,
      updatedAt: Temporal.PlainDateTime.from("2026-09-20 12:32"),
    },
    update: {},
    conflictOn: { tenantId: mawifoodsId, customerId: customerIdByEmail.get("maria@example.com")! },
  });

  const walletTransactions = [
    {
      kind: "cashback_credit",
      amountCents: 145,
      orderCode: "ORD-101",
      reason: "Cashback do pedido ORD-101",
      at: "2026-09-20 12:32",
    },
    {
      kind: "reserve",
      amountCents: -145,
      orderCode: "ORD-101",
      reason: "Reserva aplicada no pedido ORD-101",
      at: "2026-09-20 12:33",
    },
    {
      kind: "reserve_release",
      amountCents: 145,
      orderCode: "ORD-101",
      reason: "Reserva liberada no pedido ORD-101",
      at: "2026-09-20 12:34",
    },
  ] as const;

  for (const fixture of walletTransactions) {
    const id = stableId("walletTransaction", `${fixture.kind}:${fixture.at}`);

    await db.orm.public.WalletTransaction.upsert({
      create: {
        id,
        tenantId: mawifoodsId,
        walletId,
        orderId: stableId("order", fixture.orderCode),
        kind: fixture.kind,
        amountCents: fixture.amountCents,
        reason: fixture.reason,
        createdAt: Temporal.PlainDateTime.from(fixture.at),
      },
      update: {},
      conflictOn: { id },
    });
  }

  // SEO overrides: one store-wide settings row plus per-entity metadata.
  const settingsId = stableId("storeSettings", "mawifoods");

  await db.orm.public.StoreSettings.upsert({
    create: {
      id: settingsId,
      tenantId: mawifoodsId,
      seoTitleTemplate: "%s | Mawifoods",
      seoDescriptionTemplate: "Marmitas frescas entregues no mesmo dia em São Paulo.",
      seoSocialImageUrl: "https://mawifoods.example.com/og.png",
      updatedAt: Temporal.PlainDateTime.from("2026-09-20 09:00"),
    },
    update: {},
    conflictOn: { tenantId: mawifoodsId },
  });

  const seoFixtures = [
    {
      entityType: "store",
      entityId: mawifoodsId,
      title: "Mawifoods — marmitas frescas",
      description: "Marmitas, bebidas e sobremesas com entrega no mesmo dia.",
    },
    {
      entityType: "category",
      entityId: stableId("category", "Marmitas"),
      title: "Marmitas | Mawifoods",
      description: "Marmitas preparadas no dia, com opções low carb.",
    },
  ] as const;

  for (const fixture of seoFixtures) {
    await db.orm.public.SeoMeta.upsert({
      create: {
        id: stableId("seoMeta", `${fixture.entityType}:${fixture.entityId}`),
        tenantId: mawifoodsId,
        entityType: fixture.entityType,
        entityId: fixture.entityId,
        title: fixture.title,
        description: fixture.description,
      },
      update: {},
      conflictOn: {
        tenantId: mawifoodsId,
        entityType: fixture.entityType,
        entityId: fixture.entityId,
      },
    });
  }

  // `action` is free text: MEN-74 owns the closed event catalog. Append-only —
  // the seed never rewrites an existing entry.
  const auditFixtures = [
    {
      action: "DOMAIN_ADD",
      actor: "admin@menuza.com",
      target: "loja-matriz.menuza.com",
      ip: "192.168.1.1",
      at: "2026-09-20 10:12:00",
    },
    {
      action: "CONFIG_UPDATE",
      actor: "admin@menuza.com",
      target: "settings.payment.pix",
      ip: "192.168.1.1",
      at: "2026-09-20 10:30:15",
    },
    {
      action: "COUPON_CREATE",
      actor: "gestor@menuza.com",
      target: "BEMVINDO10",
      ip: "177.12.89.4",
      at: "2026-09-20 11:05:40",
    },
    {
      action: "ORDER_STATUS_UPDATE",
      actor: "operador@menuza.com",
      target: "ORD-101 (READY)",
      ip: "10.0.0.12",
      at: "2026-09-20 12:31:02",
    },
    {
      action: "DOMAIN_VERIFY",
      actor: "system",
      target: "loja-matriz.menuza.com",
      ip: "127.0.0.1",
      at: "2026-09-20 12:40:00",
    },
  ] as const;

  for (const fixture of auditFixtures) {
    const id = stableId("auditLog", `${fixture.action}:${fixture.target}:${fixture.at}`);

    await db.orm.public.AuditLog.upsert({
      create: {
        id,
        tenantId: mawifoodsId,
        action: fixture.action,
        actor: fixture.actor,
        target: fixture.target,
        ip: fixture.ip,
        createdAt: Temporal.PlainDateTime.from(fixture.at),
      },
      update: {},
      conflictOn: { id },
    });
  }

  // One meal subscription as the structural stub it is (MEN-150 owns cadence
  // charging, pausing and stock). Maria is already a weekly subscriber.
  const mealSubscriptionId = stableId("mealSubscription", "maria@example.com");

  await db.orm.public.MealSubscription.upsert({
    create: {
      id: mealSubscriptionId,
      tenantId: mawifoodsId,
      // SAFETY: Maria's customer row is seeded above.
      customerId: customerIdByEmail.get("maria@example.com")!,
      cadence: "weekly",
      status: "active",
    },
    update: {},
    conflictOn: { id: mealSubscriptionId },
  });

  console.log(
    `[db:seed] mawifoods commerce: ${categoryFixtures.length} categories, ` +
      `${productFixtures.length} products, 1 kit, ${customerFixtures.length} customers, ` +
      `${orderFixtures.length} orders, ${couponFixtures.length} coupons, ` +
      `${auditFixtures.length} audit logs, 1 meal subscription`,
  );
}

console.log(`[db:seed] nova-loja: empty on purpose (panel empty states)`);

// --- Team fixtures (MEN-225) -------------------------------------------------
//
// `settings/team` reads memberships, so the panel needs more than one row to be
// worth looking at: these give mawifoods a realistic three-person team with two
// distinct roles, and leave nova-loja with its single admin so the empty-ish
// state is still reachable.
//
// The extra members carry a password hash so they can actually log in during
// local development; without one, `verifyPassword` fails closed and the account
// would be unusable. The credential is the same local-only fixture as Marina's.
//
// ponytail: these are demo identities for the local dashboard. They carry no
// production meaning and the emails use the reserved .local TLD.

const TEAM_FIXTURES = [
  { email: "rafael@menuza.local", name: "Rafael Nunes", role: "admin" as const },
  { email: "bianca@menuza.local", name: "Bianca Alves", role: "staff" as const },
] as const;

const mawifoodsTenantId = demoTenantIds.get("mawifoods");

if (mawifoodsTenantId) {
  for (const fixture of TEAM_FIXTURES) {
    const existing = await db.orm.public.Member.where({ email: fixture.email }).first();

    const member = await db.orm.public.Member.upsert({
      update: {},
      create: {
        id: randomUUID(),
        email: fixture.email,
        name: fixture.name,
        kind: "human",
        passwordHash: existing
          ? null
          : await Bun.password.hash(DEMO_PASSWORD, {
              algorithm: "argon2id",
              memoryCost: 65536,
              timeCost: 3,
            }),
        updatedAt: now(),
      },
      conflictOn: { email: fixture.email },
    });

    const membershipBefore = await db.orm.public.TenantMembership.where({
      memberId: member.id,
      tenantId: mawifoodsTenantId,
    }).first();

    if (membershipBefore) {
      console.log(`[db:seed] team ${fixture.email} → mawifoods (${membershipBefore.role}, kept)`);
      continue;
    }

    await db.orm.public.TenantMembership.create({
      id: randomUUID(),
      memberId: member.id,
      tenantId: mawifoodsTenantId,
      role: fixture.role,
    });

    console.log(`[db:seed] team ${fixture.email} → mawifoods (${fixture.role}, created)`);
  }

  console.log(`[db:seed] mawifoods team: ${TEAM_FIXTURES.length} extra members`);
}

console.log(`[db:seed] done: ${created} created, ${reused} reused, ${conflicts} conflicts`);

await db.close();
