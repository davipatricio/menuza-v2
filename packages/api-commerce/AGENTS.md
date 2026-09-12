# @menuza/api-commerce

- Library package. Owns the commerce router implementations.
- Layout: `src/domains/<domain>/subdomains/<subdomain>/<name>.impl.ts` plus
  `src/domains/<domain>/router.ts`. Domain routers aggregate subdomain implementations.
- `dev`/`start` delegate to `@menuza/commerce` (which owns the Bun.serve process).
- Server-only: do NOT import from `apps/web` or any client code.

## Subdomain convention

Subdomains are **optional**. When the surface is flat (`user.profile.getProfile`,
`store.settings.logistics.enableIntegration`), the call chain still resolves through
the subdomain layer: `domains/store/subdomains/settings/subdomains/logistics/<name>.impl.ts`.
The router aggregator flattens nested subdomains so the procedure is callable as
`store.settings.logistics.enableIntegration` without intermediate router definitions.

- A simple subdomain is one folder, e.g. `domains/store/subdomains/members/`.
- A nested subdomain adds another folder under the subdomain, e.g.
  `domains/store/subdomains/settings/subdomains/logistics/`.
- Procedures live in `<name>.impl.ts` files. The aggregator `subdomains/<subdomain>/router.ts`
  (if present) bundles them before the domain aggregator consumes them.
