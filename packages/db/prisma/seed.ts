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
import { randomUUID } from "node:crypto";
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
// categories have no models in contract.prisma, so they cannot be seeded.

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

console.log(`[db:seed] done: ${created} created, ${reused} reused, ${conflicts} conflicts`);

await db.close();
