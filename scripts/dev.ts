#!/usr/bin/env bun
/**
 * Run all runnable app processes concurrently. Library-only workspaces
 * (apps/orpc-server, packages/shared) are not started — they are imported.
 *
 * The Bun.serve APIs are spawned from the repo root rather than through
 * `bun --filter`, because Bun's watcher only covers files under the process
 * cwd: started from `apps/<app>`, an edit to `packages/*` never restarts it
 * (it only warns that the file "is not in the project directory"). Entry paths
 * resolve against that cwd, so they are repo-root-relative here.
 */
import { spawn } from "bun";

const root = process.cwd();

const api = (app: string) => ({
  cmd: ["bun", "--env-file-if-exists=.env", "--watch", `apps/${app}/src/server.ts`],
  cwd: root,
});

const procs = [
  { name: "web", cmd: ["bun", "--filter", "@menuza/web", "dev"], cwd: root },
  api("commerce"),
  api("tenant"),
  api("worker"),
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
