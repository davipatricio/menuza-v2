#!/usr/bin/env bun
/**
 * Run the runnable app processes concurrently. Library-only workspaces
 * (packages/shared, packages/db) are not started — they are imported.
 */
import { spawn } from "bun";

const root = process.cwd();

const procs = [{ cmd: ["bun", "--filter", "@menuza/web", "dev"], cwd: root }];

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
