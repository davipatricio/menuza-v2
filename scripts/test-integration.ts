#!/usr/bin/env bun
/**
 * Run integration tests. Sets TEST_INTEGRATION=1 in-process so that
 * `describe.skipIf(!process.env.TEST_INTEGRATION)` gates light up.
 * Requires Postgres + Redis reachable via `bun run infra:up`.
 *
 * The files run one at a time (`--parallel=1`). Every DB-backed suite talks to
 * the same database: one suite seeds fixtures another reads, and several create
 * and delete their own tenants. Running the files concurrently lets one suite
 * delete rows another is asserting on, so the default fan-out fails on state no
 * single suite owns.
 */
process.env.TEST_INTEGRATION = "1";

const proc = Bun.spawn(["bun", "test", "--parallel=1"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, TEST_INTEGRATION: "1" },
});

const code = await proc.exited;

process.exit(code);
