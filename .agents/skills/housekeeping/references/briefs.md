# Brief templates

A subagent gets fresh context. It knows nothing you did not type. Every brief carries: goal ·
files or symbols · constraints · out-of-scope · exact verify command and expected result.

## Audit lane (read-only)

```
Repo root: <path>. Read-only. Thoroughness: <quick|medium|very thorough>. Shell <available|NOT available>.

Goal: find every place where <DOMAIN> contradicts the tree.

Scope: <explicit paths>. Ignore node_modules, .next, .turbo, dist.

Check against reality, not against other docs:
- <probe 1, with the exact command>
- <probe 2>

Return a table, max <N> rows, most severe first:
`file:line | claim (max 12 words) | actual | severity(high|med|low)`

No file bodies. Mark anything you could not verify as "not verified" — do not imply a clean result.
```

## Fix step (one owner, disjoint files)

```
Repo root: <path>. Scope: <exact files>. <N> findings from the board: <ids + one line each>.

<The fix, stated as the smallest correct change. Reference the repo convention to follow,
e.g. "use Field + FieldLabel for Base UI controls" or "add a SAFETY: comment with the real reason".>

Constraints:
- Touch only the listed files.
- No new dependencies, no abstractions, no refactors beyond the fix.
- Do not silence the rule: no eslint-disable, no ignorePatterns, no ignoreBuildErrors, no widened type.
- Do not run a package-wide `bun run fmt`.
- No git write commands (no add/commit/checkout/restore).

Verify (report the exit code of each):
1. `<narrow check>` → 0
2. `bun run typecheck` → 0
3. `<the tool that parses the file, e.g. bunx js-yaml for YAML, bun test for the policy test>` → 0

Reply with: files changed, per-finding fix in one line, each command + exit code, anything skipped.
```

## Mechanical batch

```
Apply exactly this transformation to every listed file. No judgment calls.

Old: <exact text>            New: <exact text>
or Rule: <precise rule>      Files: <list>

If a target is missing or the match is not exact, stop and report file + line. Do not improvise.
Reply with the files changed and any file that did not match.
```

## Dependency bump step (single owner of the lockfile)

```
Repo root: <path>. Bump only these: <table dep: old → new>.
Edit the manifests directly, then run `bun install`. Never `bun update --latest`.
Keep react and react-dom equal. Do not bump anything not listed.

Then run, reporting each exit code: bun install · workspace policy test · typecheck · test ·
`bunx oxlint .` · `bun run fmt:check` · `bun run build`.

If one bump breaks types or build, revert only that dependency, reinstall, re-run the failing
check, and report which one and the exact error. Do not silence the error.

Reply with the version table, the check table, any reverted bump, and `git diff --stat bun.lock`.
```

## Verifier

```
Run exactly these commands and report pass/fail per command with the first failing line.
You may not edit files. If a needed check is not in the list, say so instead of inventing one.
State anything you could not run and why.

1. <command>
2. <command>
```

## Brief-writing rules

- Name paths exactly, including characters that shells treat specially; tell the agent to quote them.
- One owner per file, always. Parallel groups must be file-disjoint.
- Ask for exit codes, not prose. "It works" is not a result.
- Tell the agent what NOT to do — that is where most drift comes from.
- Keep each lane small enough to finish inside its step budget.
