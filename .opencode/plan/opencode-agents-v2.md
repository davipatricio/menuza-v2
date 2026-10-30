# Restore the reviewer agent and step caps in the OpenCode v2 agent roster

Status: done
Updated: S9 verified, reviewer clean

## Non-goals

- No new agents other than `reviewer`; no renames; no rewrite of body text that still holds.
- No `hidden`, `color`, `request`, or v1 fields (`permission`, `tools`, `maxSteps`, `prompt`, `temperature`).
- No `.opencode/opencode.jsonc` change (no per-agent MCP wiring exists in v2) and no `.claude/` restore.
- At most one `ctx_*` line per agent, copied in spirit from the Claude body that already carries it.

## Assumptions

- verified: `.opencode/agents/` holds 8 files (architect, batch, critic, implementer, orchestrator, researcher, scout, verifier); `reviewer.md` is absent.
- verified: `opencode` v2.1.4 at `C:\Users\davip\.bun\bin\opencode.exe`; `opencode agent list` does NOT exist, `opencode debug agents` does and prints resolved agents as JSON (`id`, `mode`, `hidden`, `permissions`, `steps` when set).
- verified: `opencode debug agents` silently drops an agent whose frontmatter fails to parse and still exits 0 — every verify must assert presence, not just exit status.
- verified: v2 docs list `steps` and `permissions[].action` (incl. `subagent`); `hidden: true` removes the agent from the subagent catalog; omitting `mode` defaults to `all`.
- verified: Claude set at `27c9905` carries `maxTurns` architect 16, critic 6, implementer 20, verifier 10, reviewer 14, batch 12.
- verified: Claude `implementer`, `verifier`, `researcher`, `scout` bodies each route long output through `ctx_*`; the Claude `reviewer` body has no `ctx_*` line and no `.claude/plans` path, so nothing to retarget there.
- verified: `~/.config/opencode/opencode.jsonc` enables MCP `context-mode` (`disabled: false`) and leaves `plugin: []` — no RTK plugin entry.
- verified by mapping: `omniroute/utility#high` is the right tier for `reviewer` — Claude `opus-top-coding` already maps to `#high` for `critic`/`orchestrator`, and `#max` is reserved for `architect`.
- unverified: PowerShell glob `git diff*` matches both `git diff` and `git diff HEAD`; a miss only narrows the read-only shell allow list.

## Code map

- `.opencode/agents/reviewer.md` — does not exist yet.
- `.opencode/agents/orchestrator.md` — `permissions:` list (lines 5-47), routing prose (line 55), plan-board rules (60-69).
- `.opencode/agents/architect.md` — frontmatter `model` (line 4, no `steps`), plan `Format` block owner union (line ~96), rules list below it.
- `.opencode/agents/critic.md` — `model:` then `permissions:` (no `steps`).
- `.opencode/agents/implementer.md` — `model:` then `permissions:` (no `steps`), body `## Verify`.
- `.opencode/agents/verifier.md` — `model:` then `permissions:` (no `steps`), body rules list.
- `.opencode/agents/scout.md` — `steps: 8`; body bullets on graph tools (no `ctx_*` note).
- `.opencode/agents/researcher.md` — `steps: 8`; body bullets on Context7/websearch (no `ctx_*` note).
- `.opencode/agents/batch.md` — reference pattern for deny-`shell *`-then-allow (lines 14-22) and `steps: 12`.

## Steps

- [x] S1 Create `reviewer.md`: `mode: subagent`, `model: omniroute/utility#high`, `steps: 14`; permissions deny `edit *`, deny `subagent *`, deny `shell *`, then allow `shell` `git diff*`, `git show*`, `git log*`, `git status*`; body = Claude reviewer text verbatim (defects / scope drift / orphans, quote the brief line, no style notes, `blocking` or `clean` last line), no `ctx_*` line and no path edit | files: `.opencode/agents/reviewer.md` | owner: implementer | verify: `$a=opencode debug agents; $all=ConvertFrom-Json ([string]::Join([char]10,$a) -replace '\x1b\[[0-9;]*m',''); $r=$all.Where({$_.id -eq 'reviewer'}); if(-not $r -or $r.mode -ne 'subagent' -or $r.steps -ne 14){ throw 'reviewer entry wrong' }` | P1
- [x] S2 Allow the orchestrator to launch reviewer, insert it in routing, and carry the reviewer loop: permission entry after `verifier`; routing line becomes `architect, then critic, then the plan's steps, with reviewer between a step's work and its verifier`; add `blocking` goes back to the step's owner once, a second `blocking` goes to the user, skip reviewer on a single-file mechanical edit and never on a behavior change | files: `.opencode/agents/orchestrator.md` | owner: implementer | verify: `$a=opencode debug agents; if(-not ($a -match '"resource": "reviewer"')){ throw 'reviewer not allowed' }; $t=Get-Content .opencode/agents/orchestrator.md -Raw; foreach($p in @('goes back to the step.s owner once','second .blocking.','Skip .reviewer. on a single-file mechanical edit','Do not skip it on a step that changes behavior')){ if($t -notmatch $p){ throw "missing $p" } }` | P1
- [x] S3 Add `steps: 16` after `model:`; add `reviewer` to the owner union in the plan `Format` block (`<implementer/batch/scout/researcher/reviewer/verifier>`); restore the Claude rule `Add a reviewer step between any step that changes behavior and the verifier step that covers it. Both name the same files, so they never share a parallel group.` | files: `.opencode/agents/architect.md` | owner: implementer | verify: `$a=opencode debug agents; if(-not ($a -match '"steps": 16')){ throw 'architect steps' }; $t=Get-Content .opencode/agents/architect.md -Raw; foreach($p in @('step between any step that changes behavior','never share a parallel group','researcher.reviewer')){ if($t -notmatch $p){ throw "missing $p" } }` | P1
- [x] S4 Add `steps: 6` after `model:` | files: `.opencode/agents/critic.md` | owner: implementer | verify: `$a=opencode debug agents; if(-not ($a -match '"steps": 6')){ throw 'critic steps missing' }` | P1
- [x] S5 Add `steps: 20` after `model:`; add one line under `## Verify` mirroring the Claude implementer: run a check whose output is long through `ctx_execute` and read the failing line yourself | files: `.opencode/agents/implementer.md` | owner: implementer | verify: `$a=opencode debug agents; if(-not ($a -match '"steps": 20')){ throw 'implementer steps missing' }` | P1
- [x] S6 Add `steps: 10` after `model:`; add one rule mirroring the Claude verifier: `ctx_execute` counts as running a check, then read the failing line and the exit status yourself | files: `.opencode/agents/verifier.md` | owner: implementer | verify: `$a=opencode debug agents; if(-not ($a -match '"steps": 10')){ throw 'verifier steps missing' }` | P1
- [x] S7 Add one bullet mirroring the Claude scout: when a search spans many files, run it through `ctx_execute` or index once with `ctx_index` and query with `ctx_search`; read the file before reporting a line as fact | files: `.opencode/agents/scout.md` | owner: implementer | verify: `$t=Get-Content .opencode/agents/scout.md -Raw; if($t -notmatch 'ctx_execute'){ throw 'scout ctx line missing' }; $a=opencode debug agents; if(-not ($a -match '"id": "scout"')){ throw 'scout dropped' }` | P1
- [x] S8 Add one bullet mirroring the Claude researcher: for a long doc page use `ctx_fetch_and_index` then `ctx_search` to pull the needed section, and read the page directly if unavailable | files: `.opencode/agents/researcher.md` | owner: implementer | verify: `$t=Get-Content .opencode/agents/researcher.md -Raw; if($t -notmatch 'ctx_fetch_and_index'){ throw 'researcher ctx line missing' }; $a=opencode debug agents; if(-not ($a -match '"id": "researcher"')){ throw 'researcher dropped' }` | P1
- [x] S9 Verify the roster: every id resolves with its step cap, reviewer resolves as `subagent`, no v1 field exists, and the working tree shows only the intended agent files | files: `.opencode/agents/*.md` | owner: verifier | verify: `$a=opencode debug agents; $all=ConvertFrom-Json ([string]::Join([char]10,$a) -replace '\x1b\[[0-9;]*m',''); foreach($x in @(@('architect',16),@('critic',6),@('implementer',20),@('reviewer',14),@('verifier',10))){ $r=$all.Where({$_.id -eq $x[0]}); if(-not $r -or $r.steps -ne $x[1]){ throw "cap $($x[0])" } }; if($all.Where({$_.id -eq 'reviewer'}).mode -ne 'subagent'){ throw 'reviewer mode' }; $bad=Select-String -Path .opencode/agents/*.md -Pattern '^permission:','^tools:','^maxSteps:','^prompt:','^temperature:'; if($bad){ throw "v1 field in $($bad.Path)" }; git status --porcelain .opencode/agents`

## Parallel

- P1: S1, S2, S3, S4, S5, S6, S7, S8
- P2: S9 (after S1-S8)

## Risks / Not doing

- `opencode debug agents` cannot be trusted alone: a broken agent file is dropped silently, so each step asserts its own id or `steps` value.
- Verify commands here avoid the `|` character on purpose — the step line splits fields on it; use `$a=...; -match` statements instead.
- `reviewer` is read-only by construction; it cannot run tests or builds, so a wrong approach is reported as one line under Defects and the `verifier` still owns the pass/fail check.
- `mode: all` on `architect` stays as-is; only its step cap and rules change.
- Owners changed `batch` to `implementer` for S3-S8: `batch` denies `shell *`, so it cannot run its own `opencode debug agents` verify. The edits stay mechanical.
