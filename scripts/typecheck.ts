#!/usr/bin/env bun
/**
 * Run `bun check` (Bun's built-in TypeScript 7 checker) across every workspace.
 */
import { $ } from "bun";

const result = await $`bun --filter '*' typecheck`.nothrow();

if (result.exitCode !== 0) {
  console.error("[typecheck] failed");
  process.exit(result.exitCode);
}

console.log("[typecheck] ok");
