# Menuza — Claude Code instructions

@AGENTS.md

## Claude Code harness

`AGENTS.md` above is the source of truth. This file adds only what Claude Code needs on top of it.

### Nested instructions

`AGENTS.md` loads automatically only when no `CLAUDE.md` sits at or above the working directory. This file suppresses that, so read the nearest nested `AGENTS.md` before editing inside a subtree:

- `apps/web/src/**`, `crates/**/src/**`, `packages/**` each carry one; it states what is wrong or misleading one folder up.
- Read it once per subtree per session; do not read every one up front.

### Skills

Skills are authored in `.agents/skills/` and exposed through the `.claude/skills` symlink. Edit the `.agents/skills/` path, never the link. Load them by the tiers in `AGENTS.md` (`shadcn` + `menuza` always for UI), not all at once.

### Plans

Write plan boards under `.agents/plans/<kebab-task-name>.md` — the rule is in `AGENTS.md` under working agreements. `plansDirectory` in `.claude/settings.json` points there, so plan mode and any subagent write to the same folder. Do not write `.opencode/plan/`; that board is retired history.

### MCP

Servers come from `.mcp.json` at the repo root: `context-mode` and `projectmem` (`${HOME}/.local/bin/pjm-mcp`, placed there by uv). `codegraph` is not registered — the CodeGraph rule in `AGENTS.md` therefore does not apply here; use `read`/`grep`/`glob` directly.

`linear`, `context7`, `deepwiki` and `web-search` are not committed because they need credentials. Add them at user scope if you need them. `.projectmem` context also arrives through the `SessionStart` hook below.

### Hooks and the plugin

`.claude-plugin/marketplace.json` registers the first-party `menuza-harness` plugin, which carries two hooks ported from the OpenCode setup: `SessionStart` injects `.projectmem` context, and `PreToolUse` on `Bash` rewrites commands through `tokless rtk-rewrite`. Both no-op when `tokless` is absent or `.projectmem/` does not exist. Do not work around a hook by rewriting a command to a form it does not match; report the hook instead.

The plugin is enabled through `.claude/settings.json`, which needs the folder to be trusted. If it does not load, register it once by hand from the repo root:

```bash
claude plugin marketplace add ./plugins --scope project
```

`plugins/**` is excluded from lint like the other harness trees, and it sits outside every workspace, so `bun check` does not cover it either. The hooks run from the plugin cache with no `node_modules`, so keep them dependency-free.

### Code Mode

Code Mode is enabled per maintainer, not by this repository: Claude Code ignores `CLAUDE_CODE_EXPERIMENTAL_CODE_MODE` in project settings files. Set it in your shell or `~/.claude/settings.json`:

```bash
CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1 claude
```

Code Mode cannot run alongside agent teams, and it needs v2.1.323+, a supported model, and an interactive terminal session. Do not add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `.claude/settings.json`.

### Git

Never commit, push, stage, amend or tidy the tree unless explicitly asked — the rule in `AGENTS.md` applies unchanged. `git reset --hard`, `git clean` and `git branch -D` are denied in `.claude/settings.json` and by the `PreToolUse` hook.
