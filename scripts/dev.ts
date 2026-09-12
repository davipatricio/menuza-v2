#!/usr/bin/env bun
/**
 * Run all runnable app processes concurrently. Library-only workspaces
 * (apps/orpc-server, packages/shared) are not started — they are imported.
 */
import { spawn } from "bun";

const procs = [
  { name: "web", cmd: ["bun", "--filter", "@menuza/web", "dev"], cwd: process.cwd() },
  { name: "commerce", cmd: ["bun", "--filter", "@menuza/commerce", "dev"], cwd: process.cwd() },
  { name: "tenant", cmd: ["bun", "--filter", "@menuza/tenant", "dev"], cwd: process.cwd() },
  { name: "worker", cmd: ["bun", "--filter", "@menuza/worker", "dev"], cwd: process.cwd() },
];

const children = procs.map((p) =>
  spawn({ cmd: p.cmd, cwd: p.cwd, stdout: "inherit", stderr: "inherit" }),
);

const shutdown = () => {
  for (const c of children) c.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);

process.on("SIGTERM", shutdown);

await Promise.race(children.map((c) => c.exited));

shutdown();
