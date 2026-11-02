# features/settings

Store settings screens: store (SEO), delivery, payments, notifications, team,
account.

## Layout

- `server/settings.functions.ts` — `loadSettingsStoreFn` (layout guard) and
  `loadStoreSeoFn`.
- `server/account.functions.ts` — `loadSessionsFn` (member-level, no store slug)
  and `loadTeamFn` (`FORBIDDEN` → `forbidden`, everything else rethrown).
- `components/settings-section.tsx` — the shared title + description shell.
- `components/seo-settings-form.tsx`, `change-password-form.tsx`,
  `sessions-list.tsx`, `team-table.tsx`.

## Invariants

- `src/routes/dashboard/$storeSlug/settings/route.tsx` resolves the store once;
  children read it with `getRouteApi("/dashboard/$storeSlug/settings")`.
- `/settings` redirects to `/settings/store`.
- Read-only screens (`delivery`, `payments`) are static `Card` lists with a
  `Badge variant="outline"` "Em breve" — no fake toggles.
- `team-table.tsx` renders the shared `DataTable`; the member row key is
  `member.memberId` (the schema has no `id`).
- Account procedures take no `storeSlug`: an account spans stores.

## Forbidden

Next.js imports, `@menuza/db`, `@prisma/*`, `@menuza/orpc-server`.

## Verify

`bunx oxfmt apps/web/src/features/settings && bunx oxlint apps/web/src/features/settings && bun run --filter '@menuza/web' build`
