#!/usr/bin/env bun
/**
 * Run integration tests. Sets TEST_INTEGRATION=1 in-process so that
 * `describe.skipIf(!process.env.TEST_INTEGRATION)` gates light up.
 * Requires Postgres + Redis reachable via `bun run infra:up`.
 */
process.env.TEST_INTEGRATION = "1";

const proc = Bun.spawn(["bun", "test"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, TEST_INTEGRATION: "1" },
});

const code = await proc.exited;

process.exit(code);
