# FINDINGS template

Copy this to `FINDINGS.md` at the repo root. Replace every angle-bracket placeholder. Keep the
section letters; they are what the report refers to.

```md
# Housekeeping findings — <YYYY-MM-DD>

Temporary audit board. Delete once reviewed, unless items remain `[!]`.
Legend: `[x]` done or verified · `[ ]` open · `[!]` needs a human decision

Baseline before: <test counts> · typecheck <ok/fail> · lint <exit> · fmt:check <exit> · build <exit>
Final state: <same, after>

## A. CI

- [ ] **A1** <finding> — evidence: `<command>` → <result>
      file: `.github/workflows/ci.yml:<line>`

## B. Package manager / images

## C. Red checks

## D. Dependencies

## E. Tooling config

## F. Git hooks

## G. Docs drift

## H. OpenCode harness

## I. Vendored skills

## J. Security / env

## K. Cleanup / orphans

## L. Verification
```

## Rules for entries

- One finding per bullet. Ids are stable (`A1`, `D3`) so the report can cite them.
- Evidence is mandatory: a command and its result, a `file:line`, or a registry URL. No evidence →
  delete the entry.
- `[x]` means **done and verified**, not "probably fine now". Paste the exit code into the entry.
- `[!]` means a human must choose. Write the choice and the trade-off on the same line. Never
  resolve a `[!]` by picking for the user.
- When a fix changes evidence (a path moves, a version bumps), edit the entry so the board stays
  true. A stale board is worse than no board.
- Do not paste file bodies, diffs, or logs. One line of evidence, not a transcript.

## Section intents

| Section                    | What belongs there                                                             |
| -------------------------- | ------------------------------------------------------------------------------ |
| A CI                       | workflow validity, job graph, caching, permissions, secret scoping             |
| B package manager / images | runtime pins across dev/CI/containers, lockfile policy                         |
| C red checks               | anything that makes `lint`, `fmt:check`, `typecheck`, `test`, `build` non-zero |
| D dependencies             | outdated pins, catalog hygiene, transitive surprises, supply-chain checks      |
| E tooling config           | oxlint/oxfmt/turbo settings that no longer match the tree                      |
| F git hooks                | install state, hook scope, bypass policy                                       |
| G docs drift               | claims in AGENTS/README/skills that contradict the tree                        |
| H OpenCode harness         | agents, permissions, formatter, instructions, MCP reality                      |
| I vendored skills          | lock vs disk drift, local edits at risk, refresh result                        |
| J security / env           | secrets, env contract, action pinning, exposure                                |
| K cleanup / orphans        | dead files, dead exports, archives, stray artifacts                            |
| L verification             | one `[x]` per command actually run at the end                                  |
