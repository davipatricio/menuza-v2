# features/auth

Dashboard authentication: login, signup, invitation, and the server-side
authorization helpers.

## Layout

- `server/authorize.ts` — the only place that reads `TENANT_INTERNAL_URL`; used by
  server functions that need a member identity.
- `server/*.functions.ts` — login/logout and session reads.
- `components/` — form pieces; forms use `@tanstack/react-form` and the shared
  valibot schemas.
- `lib/` — small helpers (return-to sanitising, field errors).

## Invariants

- Login and signup call same-origin `/tenant/rpc` through
  `src/lib/session-client.ts`; the session cookie is httpOnly and set by the API.
- After login, `void router.invalidate()` and navigate to the sanitised
  `returnTo` (never an absolute URL off-site).
- Every dashboard loader redirects to `/dashboard/login` when `panelClient()` is
  `null`; a route never renders while unauthenticated.
- Birthdate input is a Base UI popover + calendar, never `<input type="date">`.

## Forbidden

Next.js imports, `@menuza/db`, `@prisma/*`, `@menuza/orpc-server`.

## Verify

`bunx oxfmt apps/web/src/features/auth && bunx oxlint apps/web/src/features/auth && bun run --filter '@menuza/web' build`
