#!/usr/bin/env bun
// PreToolUse hook on Bash: rewrite the command through `tokless rtk-rewrite`.
// Mirrors the OpenCode tokless-rtk plugin against the CLI's exit codes:
//   0 rewrite printed, allow rules cover it   -> allow + updatedInput
//   1 nothing printed, no rewrite             -> exit 0 unchanged
//   2 deny matched (message optional)         -> deny, or defer when no message
//   3 rewrite printed, approval deferred      -> updatedInput only
// Always exits 0: exit 2 would block regardless of the JSON payload.

interface HookInput {
  tool_input: { command: string };
}

const raw: HookInput | null = await Bun.stdin.json().catch(() => null);
const command = raw?.tool_input?.command;

if (!command) process.exit(0);

const tokless = Bun.which("tokless");

if (!tokless) process.exit(0);

const proc = Bun.spawnSync([tokless, "rtk-rewrite", "--", command], {
  stdout: "pipe",
  stderr: "pipe",
  timeout: 10_000,
});

const stdout = proc.stdout.toString().trim();
const changed = stdout.length > 0 && stdout !== command;

const write = (output: object) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: output }));
  process.exit(0);
};

const rewritten = {
  hookEventName: "PreToolUse",
  updatedInput: { ...raw.tool_input, command: stdout },
};

if (proc.exitCode === 0 && changed) {
  write({
    ...rewritten,
    permissionDecision: "allow",
    permissionDecisionReason: "Rewritten to its rtk form",
  });
}

if (proc.exitCode === 3 && changed) write(rewritten);

// Exit 2 with a message is an rtk-level deny; without one, defer to Claude's own rules.
if (proc.exitCode === 2 && !changed) {
  write({
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: proc.stderr.toString().trim() || "Denied by rtk",
  });
}

process.exit(0);
