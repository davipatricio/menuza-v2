/**
 * Singleton Prisma ORM 8 client (PostgreSQL).
 * Connection lifecycle: ONE process-wide client; runtime connects lazily on first query.
 * Call disconnectDb() on shutdown.
 */
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../prisma/generated/client/contract.ts";
import contractJson from "../prisma/generated/client/contract.json" with { type: "json" };
import { otelQueryMiddleware } from "./otel-middleware.ts";
import { tenantIsolationMiddleware } from "./tenantIsolation.ts";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required");
}

export type Db = ReturnType<typeof postgres<Contract>>;

declare global {
  // eslint-disable-next-line no-var
  var __menuzaPrisma: Db | undefined;
}

export const db: Db =
  globalThis.__menuzaPrisma ??
  postgres<Contract>({
    contractJson,
    url,
    middleware: [otelQueryMiddleware(), tenantIsolationMiddleware()],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__menuzaPrisma = db;
}

/** Readiness probe: a raw SELECT 1 through the lazily-built runtime. Throws if the DB is unreachable. */
export async function pingDb(): Promise<void> {
  const plan = db.raw.sql`SELECT 1 AS ok`.returnsRow({ ok: "pg/int4@1" }).build();
  await db.runtime().query(plan);
}

export async function disconnectDb(): Promise<void> {
  await db.close();
}
