# @menuza/api-tenant

- Library package. Owns the tenant (management) router implementations.
- Layout: `src/domains/<domain>/subdomains/<subdomain>/<name>.impl.ts` plus
  `src/domains/<domain>/router.ts`. Domain routers aggregate subdomain implementations.
- `dev`/`start` delegate to `@menuza/tenant` (which owns the Bun.serve process).
- Deny-by-default: the health probe, the push routes, the staff session + panel
  routes (`session.*`, `panel.getStore`), and the internal `internal.resolveHost`
  procedure are exposed; everything else is absent. `resolveHost` requires the
  shared internal token; the session/panel routes resolve the member from the
  `menuza_tenant_sid` cookie and, for `panel.getStore`, the tenant from `storeSlug`.
- Server-only: do NOT import from `apps/web` or any client code.
- Middlewares: import `tenantMiddleware` and `authMiddleware` from `@menuza/orpc-server/tenant` and `@menuza/orpc-server/auth`, and `internalTokenMiddleware` from `@menuza/orpc-server/internal`. Do NOT create dedicated packages for middleware or auth. Contracts come from `@menuza/shared/tenant`.

## Subdomain convention

Subdomains are **optional**. When the surface is flat (`user.profile.getProfile`,
`store.settings.logistics.enableIntegration`), the call chain still resolves through
the subdomain layer: `domains/tenant/subdomains/<subdomain>/subdomains/<subdomain>/<name>.impl.ts`.
The router aggregator flattens nested subdomains so the procedure is callable as
`tenant.<subdomain>.<sub>.<name>` without intermediate router definitions.

- A simple subdomain is one folder, e.g. `domains/tenant/subdomains/audit/`.
- A nested subdomain adds another folder under the subdomain, e.g.
  `domains/tenant/subdomains/audit/subdomains/access/`.
- Procedures live in `<name>.impl.ts` files. The aggregator `subdomains/<subdomain>/router.ts`
  (if present) bundles them before the domain aggregator consumes them.
