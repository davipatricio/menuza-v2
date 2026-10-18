---
name: housekeeping
description: >
  Repo-wide housekeeping pass for this monorepo: audit CI, dependency pins, git hooks, tooling
  config, AGENTS/docs drift, the OpenCode harness, vendored skills, the env contract, and dead
  code. Probe reality first, record everything on a temporary FINDINGS.md checkbox board, then fix
  in parallel with subagents and verify the whole check chain. Use when asked to housekeep, clean
  up the repo, review everything, update deps/skills/instructions/CI, or before a milestone.
  Never commits.
---

# Housekeeping

One pass, one board, one verify chain. The value is in the probes: most "housekeeping findings"
are already-written claims that stopped being true.

## Invariants

- **No writes to git history.** No `commit`, `push`, `tag`, `reset --hard`, `clean`, `stash drop`.
- **Never stage.** If a subagent stages, run `git restore --staged .` at once (working tree is
  untouched; nothing is lost).
- **Audit agents are read-only.** Only the fix wave writes.
- **One board file:** `FINDINGS.md` at repo root. Delete it at the end unless `[!]` items remain.
- **Every `[x]` has a command and an exit code.** A doc edit is verified by `rg`; a config edit by
  the tool that parses it; a code edit by typecheck plus the narrowest relevant check.
- **Fix the finding, not the symptom.** No new `eslint-disable`, no `ignorePatterns` entry, no
  `ignoreBuildErrors`, no widened type, no test skip.
- **Never a package-wide `bun run fmt`.** Format only the files a change touches.
- **Report a pin you did not change** (moving tags, transitive majors) instead of silently keeping it.

## Sequence

| #   | Phase                                   | Output                               |
| --- | --------------------------------------- | ------------------------------------ |
| 0   | Orient — probe reality                  | facts with evidence, no plan yet     |
| 1   | Board                                   | `FINDINGS.md` with checkbox sections |
| 2   | Audit wave — parallel, read-only        | findings appended to the board       |
| 3   | Fix wave — parallel, disjoint file sets | changed files                        |
| 4   | Verify — full chain                     | exit code per check                  |
| 5   | Report                                  | tldr, decisions still open           |

## 0. Orient — probe before planning

Never infer a system's health from its own documentation. Run these first; each row is a real
failure mode seen in this repo.

| Domain                | Probe                                                                                                                                                                | A bad answer looks like                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| CI actually runs      | `gh run list -L 5` then `gh api repos/{owner}/{repo}/actions/runs/{id}/jobs --jq .total_count`                                                                       | runs of `0s`, `total_count: 0` — the workflow never parsed, so every "green CI" claim is fiction   |
| Workflow syntax       | read the file for workflow-level `defaults:` (GitHub allows only `defaults.run.shell` / `.working-directory`); job ids must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`        | an invalid key or a `:` in a job id kills the whole file silently in the UI                        |
| Action inputs         | fetch `raw.githubusercontent.com/<owner>/<repo>/<ref>/action.yml` before trusting any `with:` key                                                                    | `oven-sh/setup-bun@v2` has **no** dependency-cache input; only `no-cache`, which caches the binary |
| Pin resolvable        | npm `registry.npmjs.org/<pkg>` (dist-tags + versions), GitHub `repos/<o>/<r>/releases/tags/<tag>`, Docker Hub `hub.docker.com/v2/repositories/<o>/<r>/tags?name=<x>` | a version absent from all three is a build that cannot start                                       |
| Installed vs declared | `bun outdated` at the root **and inside each workspace**                                                                                                             | root scope hides workspace-only deps                                                               |
| Hooks                 | `git config core.hooksPath`, `ls .husky .githooks`                                                                                                                   | docs describing hooks that were never installed                                                    |
| Baseline              | run the six checks, record exit codes                                                                                                                                | "known red baseline" notes that outlived the red                                                   |
| Runtime env           | `rg -o 'process\.env\.([A-Z0-9_]+)' apps packages` vs `.env.example`                                                                                                 | vars read but undocumented, and vars documented but dead                                           |
| Docs truth            | every backticked path, version and `bun run <x>` in agent docs must exist                                                                                            | `db:studio` that never existed; `packages/offline` that never existed                              |

Shell traps (Windows/PowerShell), all of which produce false failures:

- `| Select-Object -First N` closes the pipe early; the command exits 1 by SIGPIPE. Not a failure.
- A native command that wrote anything to stderr leaves `$LASTEXITCODE` at 1 even on success.
  Use `cmd /c "<cmd> >nul 2>&1 & echo NAME=%errorlevel%"` for a trustworthy code.
- `Select-String` / `Get-Content` treat `(`, `)`, `[`, `]` in a path as wildcards. Use `rg` or
  `Get-Content -LiteralPath`.

## 1. Board

Create `FINDINGS.md` from `references/findings-template.md`. Sections, in this order:

`A` CI · `B` package manager/images · `C` red checks · `D` dependencies · `E` tooling config ·
`F` git hooks · `G` docs drift · `H` OpenCode harness · `I` vendored skills · `J` security/env ·
`K` cleanup/orphans · `L` verification.

Marks: `[x]` done or verified · `[ ]` open · `[!]` needs a human decision. A `[!]` states the
decision and the trade-off on the line itself — do not move it into chat, and do not guess it.

Every entry carries evidence (a command, a `file:line`, a registry URL). An entry without evidence
is a rumour and gets deleted, not checked.

## 2. Audit wave

Five lanes, one read-only subagent each, dispatched **in one message**: doc drift · dependency and
tooling-config hygiene · dead code and orphans · security and env contract · external facts
(`researcher`, for library/CI/registry questions).

Brief them from `references/briefs.md`. Rules:

- Give each lane an explicit scope (paths) and an explicit output shape (`file:line | claim |
  actual | severity`, capped at ~60 rows). Forbid file dumps.
- Say whether the lane has shell. A scout without shell must say "not verified" rather than imply
  a clean result; re-run its blocked probes yourself.
- External claims (action inputs, registry versions, CLI flags) go to `researcher` with the exact
  URLs to fetch. Do not accept a remembered version number.
- Cap subagent steps. Long lanes die mid-report; keep each lane narrow enough to finish.

## 3. Fix wave

Group steps by **disjoint file sets**, then dispatch each group in one message. Two agents must
never write the same file — including the same `package.json`, the same doc, and the same lockfile.

Order:

1. Shared config first (`package.json`, `turbo.json`, `.oxlintrc.json`, CI) — everything else
   depends on them.
2. Then code, then docs, then vendored assets.
3. Never run `bun install` in two agents at once. Bumps get one dedicated step.
4. A `package.json` + `bun.lock` edit is one step, always.

Every brief names: goal · exact files · constraints · out-of-scope · the exact verify command(s)
with the exit code expected. Adapt `references/briefs.md`.

Watch for the class of fix that hides a defect: silencing a lint rule instead of adding the missing
`htmlFor`, widening a type instead of fixing the inference, moving a file into `ignorePatterns`
instead of formatting it. Reject those in the critic step.

## 4. Verify

Run the chain from `references/verification.md`, in order, recording exit codes. Then:

- `git status --porcelain` — confirm nothing is staged (`^[MADRC]` in column 1 means staged).
- `git diff --stat bun.lock` — every lockfile change traces to a named bump.
- Parse the workflow YAML and assert no `defaults:` key.
- `bunx lint-staged --diff HEAD` — the hook path works and touches only changed files.

A green narrow check is not a green repo. Exactly one step runs the full chain, after every fixer
has reported.

## 5. Report

Compact table of what changed per area, the board path, the plan path, and the `[!]` decisions that
still need a human. State plainly: no commits, nothing staged. Delete `FINDINGS.md` only when no
`[!]` remains.

## Anti-patterns

- Planning before probing; planning from memory of the docs.
- Fixing lint by adding rule overrides.
- One giant subagent that runs out of steps halfway through the audit.
- Two agents on one file, then reconciling a half-applied edit.
- A "verify" that only lints the file that changed.
- Deleting `[!]` items because they were inconvenient.

## Lookup

| Need                   | Command                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Real CI status         | `gh run list -L 5` · `gh api repos/{o}/{r}/actions/runs/{id}/jobs --jq .total_count` |
| Workflow parses        | `bunx js-yaml .github/workflows/ci.yml`                                              |
| Outdated deps          | `bun outdated` (root and per workspace) · `bun pm ls --all`                          |
| Pin exists             | npm registry · GitHub `releases/tags/<tag>` · Docker Hub tags API                    |
| Action inputs          | `raw.githubusercontent.com/<o>/<r>/<ref>/action.yml`                                 |
| Runtime env vs example | `rg -o 'process\.env\.([A-Z0-9_]+)' apps packages`                                   |
| Dead globs             | every `ignorePatterns`/`overrides`/`files` path must exist                           |
| Hooks installed        | `git config core.hooksPath`                                                          |
| Vendored skills        | `bunx skills list` · `bunx skills update -p -y`                                      |
| Trustworthy exit code  | `cmd /c "<cmd> >nul 2>&1 & echo NAME=%errorlevel%"`                                  |

Related: `ai-slop-cleaner` (bounded to one change's files), `dead-code-auditor` (reports only, never
deletes), `better-accessibility` (the a11y findings this pass surfaces).
