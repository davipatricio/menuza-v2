# features/shell

Dashboard chrome: sidebar, navigation config, overview cards, query provider.

## Layout

- `components/app-sidebar.tsx` — renders `NAV_SECTIONS`; settings children come
  from `SETTINGS_CHILDREN` and are nested under the parent item.
- `components/nav-config.ts` — the single source of labels, icons and routes.
  `NavItem.to` is a union of literal routes; add the literal when a route ships.
- `components/store-overview.tsx`, `overview-nav.tsx`, `user-menu.tsx`.
- `components/query-provider.tsx` — TanStack Query provider with the IndexedDB
  persister.
- `server/*.functions.ts` — session, stores, KPIs.

## Invariants

- Every nav entry points at a route that exists in the tree; a disabled entry is
  a bug, not a placeholder.
- `$storeSlug` is substituted with `store.tenantSlug` when building hrefs.
- Active state compares `pathname` with the concrete href.
- Overview KPIs come from the loader; the browser never refetches them on mount.

## Forbidden

Next.js imports, `@menuza/db`, `@prisma/*`, `@menuza/orpc-server`.

## Verify

`bunx oxfmt apps/web/src/features/shell && bunx oxlint apps/web/src/features/shell && bun run --filter '@menuza/web' build`
