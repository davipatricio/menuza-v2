# apps/web/tests

Unit tests for the browser app. Bun's test runner only — no Vitest, no
Playwright.

## Rules

- No infrastructure: a test that needs Postgres, Redis or a running API belongs
  in `bun run test:integration`.
- Test pure modules (`src/lib/**`, `src/offline/**`) and schemas; do not mount
  routes.
- Name files `*.test.ts` and place them here, not next to the source.
- The offline and cache-rule suites still live in `apps/web/tests/` until the
  cutover moves them; run them there for now.

## Verify

`bun test apps/web/tests/sync-queue.test.ts apps/web/tests/sw-cache-rules.test.ts`
