# src/lib

Framework-agnostic helpers. No React, no server imports, no Next.js imports.

## Files

- `format.ts` — `formatBrl`, `formatDateTime`, `formatRelativeTime`,
  `formatInteger`; every date/money display goes through here.
- `panel-labels.ts` — the single place a contract enum becomes pt-BR, plus badge
  variants.
- `csv-export.ts` — `serializeCsv`, `exportToCsv`, `CsvColumn`.
- `search-params` helpers (`filter-params.ts`), `slug.ts`, `return-to.ts`,
  `utils.ts` (`cn`).
- `form-errors.ts` — `fieldErrors` for valibot issues inside forms.
- `session-client.ts` — browser-side same-origin `fetch` client for
  session/account actions; it pairs the generated URL builders from
  `@/lib/api/tenant.ts` with `credentials: "same-origin"` and throws `ApiError`
  from `@/lib/api-error.ts` (code + message) on a non-2xx answer.
- `push-client.ts`, `push-subscription.ts` — Web Push registration helpers.
- `sw-cache-rules.ts` — cache names and runtime caching rules shared with
  `src/sw.ts`.
- `seo/title.ts` (`pageTitle`) and `seo/json-ld.ts` (`JsonLdScript`).
- `tools/registry.ts` — dashboard tool metadata.

## Invariants

- Pure functions only; no `window` access at module scope.
- Import with explicit `.ts` suffixes.
- A helper used by one feature belongs in that feature's `lib/`.

## Verify

`bunx oxfmt apps/web/src/lib && bunx oxlint apps/web/src/lib && bun run --filter '@menuza/web' typecheck`
