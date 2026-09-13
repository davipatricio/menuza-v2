// Verifies @menuza/db (Prisma ORM 8 + pg driver) survives `bun build --compile`.
// Run: bun run scripts/compile-smoke.ts (compiles to %TEMP%/opencode, executes, prints result)
import { db, pingDb, disconnectDb } from "../packages/db/src/client";

await pingDb();

const { total } = await db.orm.public.Tenant.aggregate((a) => ({ total: a.count() }));

console.log("SMOKE_OK", JSON.stringify({ tenants: total }));

await disconnectDb();
