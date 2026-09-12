# anti-slop vendored plugin provenance

Source repository: `eslint-stylistic/eslint-stylistic` (vendored via `install-anti-slop` skill).
The plugin was copied from the skill's bundled assets at `.agents/skills/install-anti-slop/assets/anti-slop/`.

Installed plugin paths:

- `tools/oxlint/anti-slop/index.ts` — generic plugin entry point (re-exports `@oxlint/plugins` + local rules)
- `tools/oxlint/anti-slop/rules/` — 18 custom anti-slop rules
- `tools/oxlint/anti-slop/effect/` — optional Effect plugin (5 rules, not registered)
- `tools/oxlint/anti-slop/vendor/eslint-stylistic/` — vendored `padding-line-between-statements` rule with LICENSE and UPSTREAM.md

Installed dependency: `@oxlint/plugins@1.82.0` (exact pin, matches `oxlint@1.82.0`).

Intentional deviations:

- No Effect plugin registered — repository has no direct `effect` package-manifest dependency.
- `require-readable-spacing` autofix applied once; subsequent lint passes without whitespace fix changes.
- `oxfmt` format ignores added for `tools/oxlint/anti-slop/**` so formatter does not reformat vendored plugin files.
- `jsPlugins` specifier uses relative path `./tools/oxlint/anti-slop/index.ts` from `.oxlintrc.json`.

Note: the rule findings in owned project source (no-shape-in-symbol-names, require-safety-comment-for-type-assertion, no-chained-type-assertions, no-unknown-parameters, no-unknown-returns, no-unsafe-dictionary-type, no-known-value-widening, no-object-parameters, no-reflect-apply, no-reflect-get, no-runtime-typeof, no-module-mocking, no-array-filter-map, no-reduce-accumulator-copy, no-conditional-empty-object-spread, no-widen-then-assert) are reported but not fixed. Cleanup is authorized separately.
