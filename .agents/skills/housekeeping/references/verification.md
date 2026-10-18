# Verification

Run in this order. Record the exit code of each; a chain is only meaningful if every link is green.

| #   | Command                                     | Proves                                                             |
| --- | ------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `bun install --frozen-lockfile`             | lockfile agrees with the manifests                                 |
| 2   | `bun test scripts/workspace-policy.test.ts` | workspace/catalog rules still hold                                 |
| 3   | `bun run typecheck`                         | the whole graph type-checks (runs `db:generate` + `typegen` first) |
| 4   | `bun test`                                  | unit suite, no infra                                               |
| 5   | `bun run lint`                              | oxlint via turbo, zero errors                                      |
| 6   | `bun run fmt:check`                         | oxfmt via turbo                                                    |
| 7   | `bun run build`                             | Next build with type checking enabled + binary compiles            |
| 8   | `bun run design:check`                      | only when dashboard UI changed                                     |
| 9   | `bunx lint-staged --diff HEAD`              | the hook path works and sees only changed files                    |

Then the non-command checks:

- `git status --porcelain` — column 1 must be blank for every line. `^[MADRC]` means something is
  staged; unstage with `git restore --staged .` (keeps the working tree).
- `git diff --stat bun.lock` — every change traces to a named bump. A surprise transitive major is
  reported, not hidden.
- `bunx js-yaml .github/workflows/ci.yml` — parses. Then assert the file has no workflow-level
  `defaults:` key and job ids contain no `:`.
- `rg -o 'process\.env\.([A-Z0-9_]+)' apps packages` vs `.env.example` — the env contract is closed.
- `git log --oneline -1` — unchanged from the commit you started on.

## Getting a trustworthy exit code

PowerShell turns stderr into a terminating error and leaves `$LASTEXITCODE` at 1 even when the
command succeeded. Always:

```
cmd /c "<command> >nul 2>&1 & echo NAME_EXIT=%errorlevel%"
```

Never pipe a long-running command into `Select-Object -First N`: closing the pipe raises SIGPIPE and
fabricates a failure.

## Known traps in this repo

| Trap                                               | Symptom                                                                           | Fix                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| turbo needs a semver `packageManager`/`devEngines` | `Missing devEngines.packageManager or legacy packageManager field` on every task  | use `devEngines.packageManager` with a range like `>=1.4.3`; `bun@canary` is rejected as `invalid_package_manager_field` |
| workflow-level `defaults.cache`                    | the whole workflow never runs; runs show `0s` and `total_count: 0`                | `actions/cache` steps                                                                                                    |
| `setup-bun` has no dep cache                       | cache miss forever, slow CI                                                       | `actions/cache` on `~/.bun/install/cache` keyed by `hashfile(bun.lock)`                                                  |
| Bun canary has no immutable tag                    | `1.4.4-canary.1` resolves nowhere                                                 | pin the channel in one `env:` and in `devEngines`                                                                        |
| `oxlint --fix` and `oxfmt` disagree                | formatting reintroduces `anti-slop/require-readable-spacing`                      | fix, format, re-lint; a second pass must change nothing                                                                  |
| `oxfmt --check .` from the root                    | flags generated `migrations/**` and `openapi/*.json` that package scripts exclude | check per package, or scope the path                                                                                     |
| paths containing `(`, `)`, `[`, `]`                | `Select-String`/`Get-Content` silently match nothing                              | `rg` or `-LiteralPath`                                                                                                   |
| a subagent stages files                            | unexpected staged set in `git status`                                             | `git restore --staged .`, then report it                                                                                 |

## Definition of done

All of 1–8 green, the four non-command checks true, nothing staged, no commits, and the board's `[x]`
entries each carry the evidence that produced them.
