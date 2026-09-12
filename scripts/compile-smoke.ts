// Verifies @menuza/db (Prisma 7 + driver adapter) survives `bun build --compile`.
// Run: bun run scripts/compile-smoke.ts (compiles to %TEMP%/opencode, executes, prints result)
import { prisma } from "../packages/db/src/client";

const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;

console.log("SMOKE_OK", JSON.stringify(rows));

await prisma.$disconnect();
