#!/usr/bin/env bun
// SessionStart hook: inject .projectmem context, mirroring the OpenCode plugin.
// No-op when tokless is missing or .projectmem/ does not exist.

import { existsSync } from "node:fs";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (!existsSync(join(projectDir, ".projectmem"))) process.exit(0);

const tokless = Bun.which("tokless");
if (!tokless) process.exit(0);

let text = "";
try {
  const proc = Bun.spawnSync([tokless, "projectmem-hook", "text"], {
    cwd: projectDir,
    stdout: "pipe",
    stderr: "ignore",
    timeout: 15_000,
  });
  if (proc.exitCode === 0) text = proc.stdout.toString().trim();
} catch {
  process.exit(0);
}

if (!text) process.exit(0);

const MAX = 10_000;
if (text.length > MAX) text = `${text.slice(0, MAX)}\n… (truncated)`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: text,
    },
  }),
);
process.exit(0);
