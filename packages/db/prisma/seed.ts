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

  // The mockup's UPPERCASE statuses become the contract's lowercase ASCII set;
  // the pt-BR labels stay in the UI.
  const orderFixtures = [
    {
      code: "ORD-101",
      email: "maria@example.com",
      totalCents: 14550,
      status: "ready",
      at: "2026-09-20 12:30",
    },
    {
      code: "ORD-102",
      email: "joao@example.com",
      totalCents: 8200,
      status: "confirmed",
      at: "2026-09-20 12:45",
    },
    {
      code: "ORD-103",
      email: "ana@example.com",
      totalCents: 21000,
      status: "delivered",
      at: "2026-09-20 11:15",
    },
    {
      code: "ORD-104",
      email: "carlos@example.com",
      totalCents: 4990,
      status: "pending",
      at: "2026-09-20 13:00",
    },
    {
      code: "ORD-105",
      email: "beatriz@example.com",
      totalCents: 12000,
      status: "canceled",
      at: "2026-09-20 10:20",
    },
    {
      code: "ORD-106",
      email: "lucas@example.com",
      totalCents: 9500,
      status: "confirmed",
      at: "2026-09-20 13:10",
    },
    {
      code: "ORD-107",
      email: "fernanda@example.com",
      totalCents: 31000,
      status: "ready",
      at: "2026-09-20 13:15",
    },
    {
      code: "ORD-108",
      email: "rafael@example.com",
      totalCents: 6400,
      status: "pending",
      at: "2026-09-20 13:20",
    },
    {
      code: "ORD-109",
      email: "juliana@example.com",
      totalCents: 17820,
      status: "delivered",
      at: "2026-09-20 09:40",
    },
    {
      code: "ORD-110",
      email: "rodrigo@example.com",
      totalCents: 5400,
      status: "confirmed",
      at: "2026-09-20 13:25",
    },
    {
      code: "ORD-111",
      email: "paula@example.com",
      totalCents: 13290,
      status: "awaiting_payment",
      at: "2026-09-20 13:30",
    },
    {
      code: "ORD-112",
      email: "tiago@example.com",
      totalCents: 8850,
      status: "paid",
      at: "2026-09-20 13:35",
    },
  ] as const;

  for (const fixture of orderFixtures) {
    await db.orm.public.Order.upsert({
      create: {
        id: stableId("order", fixture.code),
        tenantId: mawifoodsId,
        code: fixture.code,
        // SAFETY: every fixture email is one of the customers seeded above.
        customerId: customerIdByEmail.get(fixture.email)!,
        totalCents: fixture.totalCents,
        status: fixture.status,
        createdAt: Temporal.PlainDateTime.from(fixture.at),
      },
      update: {},
      conflictOn: { tenantId: mawifoodsId, code: fixture.code },
    });
  }

  // `value` is cents for a fixed discount and a whole percent for a percentage
  // one — the same Int column, read through discountType.
  const couponFixtures = [
    {
      code: "BEMVINDO10",
      discountType: "percentage",
      value: 10,
      usageCount: 142,
      status: "active",
    },
    { code: "QUERO20", discountType: "fixed", value: 2000, usageCount: 45, status: "active" },
    {
      code: "BLACKFRIDAY",
      discountType: "percentage",
      value: 30,
      usageCount: 500,
      status: "expired",
    },
    { code: "TESTE", discountType: "fixed", value: 500, usageCount: 0, status: "disabled" },
  ] as const;

  for (const fixture of couponFixtures) {
    await db.orm.public.Coupon.upsert({
      create: {
        id: stableId("coupon", fixture.code),
        tenantId: mawifoodsId,
        code: fixture.code,
        discountType: fixture.discountType,
        value: fixture.value,
        usageCount: fixture.usageCount,
        status: fixture.status,
      },
      update: {},
      conflictOn: { tenantId: mawifoodsId, code: fixture.code },
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

console.log(`[db:seed] done: ${created} created, ${reused} reused, ${conflicts} conflicts`);

await db.close();
