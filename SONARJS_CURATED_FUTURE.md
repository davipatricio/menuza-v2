# SonarJS rules deferred from the enabled set

Reference for `tools/oxlint/sonarjs/index.ts` + `.oxlintrc.json`.

Source of truth: `eslint-plugin-sonarjs@4.2.1` (SonarJS 4.2.1, 2026-09-15).
Upstream rule table: `packages/analysis/src/jsts/rules/README.md` in
[SonarSource/SonarJS](https://github.com/SonarSource/SonarJS).

The upstream `recommended` config contains **230** rules. We enable a subset.
This file records every rule we deliberately do **not** enable today, and why,
so the decision is auditable and reversible.

## Numbers

| Bucket | Count |
| --- | --- |
| Upstream rules (non-deprecated) | 282 |
| In `recommended`, type-aware | 57 |
| In `recommended`, runnable | 173 |
| Enabled by us (recommended + curated extras) | 165 |
| Turned off despite being recommended & runnable | 8 |
| Deferred — type-aware, cannot run | 69 |
| Deferred — not in `recommended`, not enabled | 40 |

## 1. Cannot run: type-aware rules (69)

Oxlint JS plugins have **no access to TypeScript type information**. These rules
call `require("typescript")` and build a TS program; without a program they
either no-op or misfire. They are safe to keep in the config as `off` — enabling
them accomplishes nothing.

Enable them only if we adopt `oxlint-tsgolint` with `options.typeAware: true`,
which runs rules in a separate Go process. Note that tsgolint executes
`typescript/*` rules, **not** third-party JS plugin rules, so this likely means
SonarJS type-aware coverage stays unavailable under oxlint regardless.

In-file: `@oxlint/plugins` cannot bridge this; there is no `parserServices`
equivalent exposed to JS plugins.

### High-value rules in this bucket (candidates if we ever change linter)

| Rule | ID | Why we want it |
| --- | --- | --- |
| `null-dereference` | S2259 | Real bug class; catches `a?.b` gaps |
| `no-try-promise` | S4822 | `try { await p } catch {}` swallows rejections |
| `no-ignored-return` | S2201 | Silent result drops |
| `unused-import` | S1128 | Type-only import hygiene |
| `void-use` | S3735 | Fire-and-forget promises |
| `deprecation` | S1874 | Catches removed APIs before runtime |
| `different-types-comparison` | S3403 | `===` across disjoint types |
| `no-array-delete` | S2870 | Sparse-array footgun |
| `sql-queries` | S2077 | **Relevant** — we hand-build SQL in `packages/db` |
| `reduce-initial-value` | S6959 | Empty-reduce crashes |
| `prefer-read-only-props` | S6759 | React prop discipline |
| `jsx-no-leaked-render` | S6439 | `cond && <X/>` rendering `0` |
| `no-misused-promises` | S6544 | Effect/handler promise misuse |

Full list of 57 recommended type-aware rules: `anchor-precedence`,
`argument-type`, `arguments-order`, `array-callback-without-return`,
`assertions-in-tests`, `bitwise-operators`, `concise-regex`, `deprecation`,
`different-types-comparison`, `disabled-auto-escaping`,
`disabled-resource-integrity`, `dompurify-unsafe-config`,
`duplicates-in-character-class`, `empty-string-repetition`, `existing-groups`,
`function-return-type`, `in-operator-type-error`,
`index-of-compare-to-positive-number`, `jsx-no-leaked-render`,
`new-operator-misuse`, `no-alphabetical-sort`, `no-array-delete`,
`no-associative-arrays`, `no-async-constructor`, `no-collection-size-mischeck`,
`no-control-regex`, `no-empty-after-reluctant`, `no-empty-alternatives`,
`no-empty-character-class`, `no-empty-group`, `no-ignored-return`, `no-in-misuse`,
`no-incompatible-assertion-types`, `no-invalid-regexp`,
`no-misleading-array-reverse`, `no-misleading-character-class`,
`no-redundant-optional`, `no-regex-spaces`, `no-selector-parameter`,
`no-small-switch`, `no-try-promise`, `no-undefined-argument`,
`no-useless-intersection`, `null-dereference`, `post-message`,
`prefer-read-only-props`, `prefer-regexp-exec`, `reduce-initial-value`,
`regex-complexity`, `single-char-in-character-classes`,
`single-character-alternation`, `slow-regex`, `sql-queries`,
`synchronous-exception-assertions`, `unused-import`, `unused-named-groups`,
`void-use`.

Plus 12 non-recommended type-aware rules: `argument-type`-adjacent extras,
`class-prototype`, `function-return-type` variants, `no-implicit-dependencies`
typing, `no-incorrect-string-concat`, `no-inconsistent-returns`,
`no-require-or-define`, `no-return-type-any`, `non-number-in-arithmetic-expression`,
`operation-returning-nan`, `strings-comparison`, `values-not-convertible-to-numbers`.

## 2. Recommended and runnable, but turned off (8 + 6 house-style)

These are in upstream `recommended` and would work today. We disable them
because oxlint already covers them or they fight our deliberate style.

### 2a. Duplicates of oxlint native rules (8)

oxlint implements these in Rust and they are already active via
`categories.correctness: error`. Running the SonarJS twin produces duplicate
diagnostics on the same line.

| SonarJS | ID | oxlint native equivalent |
| --- | --- | --- |
| `no-unused-vars` | S1481 | `eslint/no-unused-vars` (we set it to `warn`) |
| `no-labels` | S1119 | `eslint/no-labels` |
| `no-dead-store` | S1854 | `eslint/no-useless-assignment` |
| `no-useless-catch` | S2737 | `eslint/no-useless-catch` |
| `no-fallthrough` | S128 | `eslint/no-fallthrough` |
| `no-delete-var` | S3001 | `eslint/no-delete-var` |
| `block-scoped-var` | S2392 | `eslint/block-scoped-var` |
| `no-nested-functions` | S2004 | `eslint/max-depth` + `no-nested-functions` |

### 2b. Style conflicts with the `anti-slop` plugin (6)

| Rule | ID | Off because |
| --- | --- | --- |
| `no-parameter-reassignment` | S1226 | The codebase intentionally reuses parameter names for destructured and defaulted values. `anti-slop/no-known-value-widening` covers the real hazard. |
| `use-type-alias` | S4323 | We use `interface` for object contracts and `type` for unions — a distinction the rule erases. |
| `public-static-readonly` | S1444 | Our Prisma-facing classes use mutable statics for tenant context. |
| `no-nested-conditional` | S3358 | A single ternary-in-return is idiomatic here; `anti-slop/require-readable-spacing` governs formatting. |
| `prefer-while` | S1264 | We prefer `for...of`; this pushes classic index `while` loops. |
| `hardcoded-secret-signatures` | S6437 | Every legitimate env-driven read trips it. `sonarjs/no-hardcoded-secrets` (also enabled) is the rule that actually catches leaks. |

### 2c. Off for noise (3)

| Rule | ID | Off because |
| --- | --- | --- |
| `no-commented-code` | S125 | **Known broken under oxlint** — the only rule failing oxlint's own conformance suite (4/18 tests). Expects a `parser` that oxlint's JS plugin path does not provide. |
| `todo-tag` / `fixme-tag` | S1135 / S1134 | Pure annotation policing; the repo has no such convention to enforce. |

## 3. Deferred: not in `recommended`, not enabled (40)

Runnable today, but opt-in. Grouped by whether we would ever want them.

### Worth trialing (real bug catchers)

| Rule | ID | Note |
| --- | --- | --- |
| `no-duplicate-string` | S1192 | Default threshold 3. Noisier than it sounds — we already centralize repeated literals. |
| `no-reference-error` | S3827 | Use-before-declaration for `var`. Low value in an ESM codebase. |
| `no-implicit-dependencies` | S4328 | **Consider** — would enforce the workspace import boundary. It reads `package.json` from disk; needs verifying it works from a JS plugin. |
| `no-collapsible-if` | S1066 | Safe mechanical cleanup, auto-fixable in spirit. |
| `elseif-without-else` | S126 | Style preference, not a defect. |
| `no-built-in-override` | S2424 | Rare but real prototype-pollution vector. |
| `no-nested-switch` | S1821 | Subsumed by our `nested-control-flow` cap. |
| `no-wildcard-import` | S2208 | We use `import type` barrels deliberately. |
| `no-undefined-assignment` | S2138 | Fights optional-property style; `anti-slop` covers the real cases. |
| `destructuring-assignment-syntax` | S3514 | `let a; a = 1;` → `let { a } = ...`. Mostly redundant with `prefer-const`. |
| `too-many-break-or-continue-in-loop` | S135 | Style. |
| `no-nested-incdec` | S881 | Style; `no-plusplus` territory. |

### Deliberately unwanted (formatting / naming — oxfmt's job)

`arrow-function-convention`, `array-constructor`, `arguments-usage`,
`bool-param-default`, `call-argument-line` (already enabled via recommended),
`comment-regex`, `declarations-in-global-scope`, `file-header`,
`file-name-differ-from-class`, `for-in`, `function-name`, `no-mixed-completion-style`,
`no-sonar-comments`, `no-unused-function-argument`, `no-variable-usage-before-declaration`,
`prefer-object-literal`, `shorthand-property-grouping`, `variable-name`,
`max-union-size`.

### Framework / infra rules that never match here

`no-networkidle-wait` (Playwright — we use Bun test), `composite-assertions`,
`max-lines` (oxfmt handles file shape; we set `max-lines-per-function` instead),
`max-lines-per-function` (we **do** enable this one), `expression-complexity`
(we **do** enable), `cyclomatic-complexity` (we **do** enable),
`nested-control-flow` (we **do** enable), `no-implicit-dependencies` (see above),
`aws-iam-all-resources-accessible` (no AWS in this project — the rest of the
`aws-*` family is enabled but inert for the same reason).

## 4. Non-`recommended` complexity rules we enabled anyway

These four are **not** in upstream `recommended`. The task explicitly asked for
complexity limits, so we turn them on with thresholds tighter than Sonar's
defaults:

| Rule | ID | Upstream default | Our value |
| --- | --- | --- | --- |
| `cyclomatic-complexity` | S1541 | 10 | **8** |
| `cognitive-complexity` | S3776 | 15 | **12** |
| `expression-complexity` | S1067 | 3 | 3 (default) |
| `nested-control-flow` | S134 | 3 | 3 (default) |
| `max-lines-per-function` | S138 | 200 | **120** |

All are `warn`, not `error`, so they surface in review without blocking CI.
`oxfmt` handles line width and file layout, so `max-lines` is not needed.

## 5. Rejected approach: forcing `typescript` to 7.x

`eslint-plugin-sonarjs@4.2.1` declares a hard runtime dependency
`typescript: ">=5 <6.1.0"`, imported eagerly at module load by ~57 rules
(verified: `cjs/S3800/rule.js` contains `require("typescript")`).

Bun resolves that range to **`typescript@6.0.3`**, which is now present in
`node_modules/.bun`. The existing policy test in `scripts/workspace-policy.test.ts`
only rejects a bare `typescript` entry (it predates Bun's versioned store
layout), so it does **not** currently catch this. That is a gap, not a pass.

**We tried pinning to TypeScript 7.0.2 via a `package.json` `overrides` block.
It fails at plugin load**, before a single rule runs:

```
x Failed to load JS plugin: ./tools/oxlint/sonarjs/index.ts
| TypeError: Cannot read properties of undefined (reading 'Void')
|   at .../eslint-plugin-sonarjs/cjs/helpers/type.js:202:59
```

TypeScript 7 is the Go port with a different export surface; `ts.SyntaxKind.Void`
is absent. So the shadow TS 6 install must stay. Consequences to accept:

- `typescript@6.0.3` is a **dev-only, linter-only** transitive dependency.
  No first-party code compiles against it; `catalog.typescript` remains `7.0.2`
  and every workspace's `tsc` is 7.0.2.
- The real policy fix is to **update section 5 of
  `scripts/workspace-policy.test.ts`** to parse the versioned store layout
  (`typescript@<major>.<minor>.<patch>`) and fail on any 5.x/6.x — which would
  then correctly fail here, forcing an explicit, documented carve-out for
  lint-only tooling the way Prisma Studio already has one. That tightening is
  out of scope for this change but should be a follow-up; leaving the loose
  check in place means the guardrail is weaker than it reads.

## 6. License note

SonarJS moved to the **Sonar Source-Available License v1 (SSALv1)** for
releases after 2024-11-29. Per-file headers in the npm tarball
(`cjs/plugin-rules.js`) carry SSALv1, while `package.json` still declares
`LGPL-3.0-only`. We consume it as an unmodified dev dependency for local
linting only; nothing is redistributed. Fine for a private application, but
revisit before any public release or if the plugin is ever vendored.
