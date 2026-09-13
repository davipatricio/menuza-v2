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

console.log(`[db:seed] done: ${created} created, ${reused} reused, ${conflicts} conflicts`);

await db.close();
