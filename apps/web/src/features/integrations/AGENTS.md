# features/integrations

Integration catalog list and the per-integration detail (settings, MCP connect,
sessions).

## Layout

- `server/integrations.functions.ts` — `loadIntegrationsFn` and
  `loadIntegrationFn` (state + MCP sessions + the public `/mcp` URL).
- `components/integration-card.tsx` — card whose title link stretches over the
  card with `after:absolute after:inset-0`; the switch sits in a `relative z-10`.
- `components/integration-toggle.tsx`, `integration-settings-form.tsx`,
  `mcp-sessions-list.tsx` — islands.
- `components/mcp-connect.tsx`, `integration-logo.tsx`, `status-badge.tsx`,
  `integration-about.tsx` — presentational.

## Invariants

- The catalog in `@menuza/shared/tenant` decides which cards exist; the panel
  only supplies per-store state, so a new integration needs no backfill.
- The MCP URL is derived from the request host inside the server function
  (`absoluteUrl`), never from a constant.
- The switch and the settings form write through `panel.saveIntegration` and
  then `void router.invalidate()`.
- Screenshots render as plain `<img>` with width/height and the
  `nextjs/no-img-element` disable line (this is not a Next app).

## Forbidden

Next.js imports, `@menuza/db`, `@prisma/*`, `@menuza/orpc-server`.

## Verify

`bunx oxfmt apps/web/src/features/integrations && bunx oxlint apps/web/src/features/integrations && bun run --filter '@menuza/web' build`
