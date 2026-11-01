# Remove codebase-memory and ripgrep

Status: done
Updated: S3 verified

Goal: drop the `codebase-memory` and `ripgrep` MCP servers everywhere they are wired, and delete
the agents/docs that depend on the codebase-memory graph.

## Non-goals

- Other MCP servers (chrome-devtools, context7, web-search, linear, deepwiki, context-mode).
- `ripgrep` as a CLI or as an oxc dependency inside the repo.
- Re-installing or re-indexing anything.

## Assumptions

- Verified: `opencode mcp list` shows `codebase-memory failed` (binary missing) and `ripgrep connected`.
- Verified: global config `C:\Users\davip\.config\opencode\opencode.jsonc` holds both servers at
  `mcp.servers` lines 116-121 (`codebase-memory`) and 170-177 (`ripgrep`).
- Verified: global `AGENTS.md` lines 1-37 are the `<!-- codebase-memory-mcp:start/end -->` block.
- Verified: global `agents/` holds `codebase-memory.md`, `codebase-memory-scout.md`,
  `codebase-memory-auditor.md`.
- Verified: repo references are `.opencode/agents/{architect,orchestrator}.md` (3 `subagent` allows
  each), `.opencode/agents/scout.md` line 26, `AGENTS.md` lines 123-125, `docs/agents/codebase-memory.md`.

## Code map

- `C:\Users\davip\.config\opencode\opencode.jsonc` -> `mcp.servers`
- `C:\Users\davip\.config\opencode\AGENTS.md` -> codebase-memory block
- `C:\Users\davip\.config\opencode\agents\` -> three agent files
- `.opencode/agents/architect.md`, `.opencode/agents/orchestrator.md`, `.opencode/agents/scout.md`
- `AGENTS.md`, `docs/agents/codebase-memory.md`

## Steps

- [x] S1 Global config and docs: delete the `mcp.servers.codebase-memory` entry, the
      `mcp.servers.ripgrep` entry, the codebase-memory block (markers included) in global `AGENTS.md`,
      and the three global `agents/codebase-memory*.md` files. Keep all other servers and agents.
      | files: `C:\Users\davip\.config\opencode\opencode.jsonc`, `C:\Users\davip\.config\opencode\AGENTS.md`, `C:\Users\davip\.config\opencode\agents\codebase-memory.md`, `C:\Users\davip\.config\opencode\agents\codebase-memory-scout.md`, `C:\Users\davip\.config\opencode\agents\codebase-memory-auditor.md`
      | owner: implementer
      | verify: `opencode mcp list` must not mention `codebase-memory` or `ripgrep`, and
      `Get-ChildItem C:\Users\davip\.config\opencode\agents -Name` must not list a codebase-memory file.
      | P1

- [x] S2 Repo agents and docs: remove the three `subagent codebase-memory*` allow entries from
      `architect.md` and `orchestrator.md`; rewrite `scout.md` line 26 to prefer `rg`/glob/read instead
      of the graph tools; delete `docs/agents/codebase-memory.md`; delete the `## Codebase memory`
      section from `AGENTS.md`.
      | files: `.opencode/agents/architect.md`, `.opencode/agents/orchestrator.md`, `.opencode/agents/scout.md`, `AGENTS.md`, `docs/agents/codebase-memory.md`
      | owner: implementer
      | verify: `git grep -n -E -i 'codebase.memory' -- . ':!*.lock'` returns nothing and
      `opencode debug agents` still lists `orchestrator`, `architect`, `scout`.
      | P1

- [x] S3 Gate: confirm both trees are clean of the two servers and the three agents, and that the
      remaining MCP servers are untouched.
      | files: `C:\Users\davip\.config\opencode\opencode.jsonc`, `C:\Users\davip\.config\opencode\AGENTS.md`, `.opencode/agents/*.md`, `AGENTS.md`
      | owner: verifier
      | verify: `opencode mcp list` lists exactly chrome-devtools, context-mode, context7, deepwiki, linear, web-search;
      `git grep -n -E -i 'codebase.memory' -- . ':!*.lock'` empty; `Select-String -Path C:\Users\davip\.config\opencode\AGENTS.md -Pattern 'codebase-memory'` empty.
      | P2

## Parallel

- P1: S1, S2 (disjoint files, no overlap with the global config).

## Risks

- `opencode mcp list` may need a restart to re-read config; a stale positive is a false failure.
- Global config edits sit outside the repo; permission `external_directory` may block the owner.
