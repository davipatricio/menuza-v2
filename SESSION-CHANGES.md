# Claude Code harness for Menuza

Adds a committed `.claude/` setup so every maintainer gets the same agent roster,
the same settings, and the same MCP server. `.opencode/` is left untouched — it stays
the parallel OpenCode setup.

## Added

- `.claude/settings.json` — shared project settings.
  - `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enables agent teams. This is the only
    mechanism; there is no `agentTeams` settings key and no generic `experimental` object.
  - `teammateMode: in-process` — split panes require tmux or iTerm2 and do not work in
    Windows Terminal.
  - `enableWorkflows: true` (`disableWorkflows` from any source still wins).
  - `plansDirectory: .claude/plans` — where `architect` and `orchestrator` write plans.
  - `enabledMcpjsonServers: ["context-mode"]` — pre-approves the committed server so
    maintainers are not prompted after folder trust.
- `.claude/agents/` — nine subagents, all `permissionMode: bypassPermissions`:

  | Agent          | Model           | Role                                         |
  | -------------- | --------------- | -------------------------------------------- |
  | `orchestrator` | opus-top-coding | owns multi-step tasks, drives the plan board |
  | `architect`    | opus-top-coding | writes one plan file per task                |
  | `critic`       | opus-top-coding | attacks a plan before work starts            |
  | `reviewer`     | opus-top-coding | reviews a diff, returns blocking or clean    |
  | `implementer`  | opus-top-coding | makes one scoped change and runs its check   |
  | `scout`        | sonnet-utility  | read-only repo lookup                        |
  | `researcher`   | sonnet-utility  | external docs, cited                         |
  | `verifier`     | sonnet-utility  | runs the named checks, reports pass/fail     |
  | `batch`        | sonnet-utility  | mechanical repeated edits                    |

- `.claude/skills` — symlink to `../.agents/skills`, so skills are authored once.
- `.mcp.json` (repo root) — `context-mode` MCP server via `bunx -y context-mode`.
- `AGENTS.md` — new `## Claude Code harness` section documenting all of the above.

## Changed

- `scout`, `researcher`, `implementer`, `verifier`, `orchestrator` now use the
  `ctx_*` tools to keep long tool output out of context.
- `scout`, `architect`, `orchestrator` no longer reference `codebase-memory-mcp`,
  which is no longer connected in this environment.

## Known limits

- The full context-mode Claude plugin (`/plugin marketplace add mksglu/context-mode`)
  is per-user and cannot be committed. Without it, only the `ctx_*` MCP tools are
  available — not the hook-based output routing.
- Claude Code agent frontmatter has no scoped edit allowlist, so each agent's write
  scope is stated in its prompt instead.
- Nested subagents are unsupported; `orchestrator` scouts before calling `architect`
  so the planner rarely needs to spawn.
