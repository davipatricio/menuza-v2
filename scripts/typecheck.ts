#!/usr/bin/env bun
/**
 * Run TypeScript 7 checks across every workspace.
 * Requires `bun run db:generate` and `bun run typegen` to have produced
 * the local types (Prisma client, Next route/env types).
 */
import { $ } from "bun";

// Ensure generated types exist before typechecking.
await $`bun run db:generate`.quiet();

await $`bun run typegen`.quiet();

const result = await $`bun --filter '*' typecheck`.nothrow();

if (result.exitCode !== 0) {
  console.error("[typecheck] failed");
  process.exit(result.exitCode);
}

console.log("[typecheck] ok");
