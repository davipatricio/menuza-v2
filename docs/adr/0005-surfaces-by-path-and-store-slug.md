# Surfaces by path on the main domain, store identity by slug

One all-in-one `apps/web` serves marketing, dashboard, and storefront as three
route groups. The management surface lives only on the main domain, addressed
by store slug; tenant hosts serve the storefront only. Supersedes the
host→shell split in ADR-0003 for the landing and management surfaces.

## Context

ADR-0003 chose host-aware routing: `WEB_HOST_MAP` mapped a host to one of
`landing` / `storefront` / `management`, and `proxy.ts` rejected any path
outside that mode. That holds while a host maps to exactly one surface.

A tenant can own several addresses at once — `menuza.com.br/store/mawifoods`,
`mawifoods.com.br`, `mawifoods.menuza.com.br`. Enumerating custom domains in an
env CSV does not scale, and the dashboard must not be reachable from a host the
tenant controls. Separately, `Tenant.slug` already exists and is unique, but no
URL used it: the only public identity was `Domain.host`.

## Decision

**One app, three route groups.** `app/(marketing)/`, `app/(dashboard)/`, and
`app/(storefront)/`. Groups give each surface its own layout without sharing a
visual shell; global providers (theme, query persistence, service worker,
offline bridge) stay in the root layout.

**The main domain is named by config.** `WEB_MAIN_DOMAIN` identifies it;
`WEB_STORE_DOMAIN_SUFFIX` (e.g. `menuza.com.br`) names the store subdomain
pattern. A host that is neither the main domain, a store subdomain, nor a
`Domain` row returns 404. This keeps the fail-closed property ADR-0003 had —
an arbitrary hostname must not serve our marketing pages.

**Store identity is the slug.** `Tenant.slug` is the canonical identifier and
appears in the dashboard path. Subdomains derive from it:
`<slug>.<WEB_STORE_DOMAIN_SUFFIX>` resolves against `Tenant.slug`, not against
`Domain`. `Domain` holds custom domains only, so a tenant keeps one identity
and any number of addresses.

**The dashboard is main-domain only.** `/dashboard/[storeSlug]/...` is the
management surface. Tenant hosts return 404 for any management path.

**The storefront is reachable two ways.** `<slug>.<suffix>` and a custom domain
serve it at the root; `/store/[storeSlug]/...` on the main domain serves the
same surface as an alias. Canonical address is custom domain > subdomain; the
path alias answers 200 with `<link rel="canonical">` rather than redirecting,
so shared links stay valid.

**Tenant resolution for the dashboard is by slug, not by host.** Procedures
receive `storeSlug` in their input and the API resolves slug → tenant before
the membership check. The API stays authoritative for membership; the layout
gates authentication only. Resolving the slug in the browser-side layer and
injecting `x-menuza-tenant-id` was rejected — it moves a trust decision into
the caller.

**Dashboard shell.** Sidebar grouped in labelled sections (`collapsible="icon"`),
the sidebar's built-in Sheet for mobile (it must close on navigation), store
picker and breadcrumb in the content header, user menu in the sidebar footer.
Store picker is always shown at `/dashboard`, even for a single store.

**Static shell first; a Suspense boundary only on evidence.** The dashboard
shell prerenders. A client component reading `usePathname()` for active-link
state does not need a `<Suspense>` boundary while every route segment is known
at build time (`generateStaticParams`), so adding one speclatively is not the
default. Add the boundary only when a build or the served HTML shows a layout
shift or a blocking-prerender failure, and then as close to the hook as
possible. The follow-up that introduces session reads in the shell is the
change expected to require it.

## Consequences

- `proxy.ts` loses the `management` mode and its host requirement for
  `/manage`; `/dashboard` joins the main domain's allowed paths. `/manage` and
  `/admin` are deleted.
- A dashboard URL is shareable and readable inside a team without exposing the
  store's own hostname.
- `packages/shared` and the tenant contract gain `storeSlug` on dashboard
  procedures. This is a breaking change to those procedures and ships with the
  follow-up, not with the mockup.
- Buyer sessions stay host-only (`Path=/`, no `Domain=`), so the same store on
  three addresses has three buyer sessions. Reconciling that is part of the
  follow-up; it is not solved by this ADR.
- `usePathname` reads the source path on the server when a rewrite applies,
  while the browser sees the rewritten path. Active-link state must defer its
  read until after mount on rewritten routes.
- A 403 for a missing permission cannot be a real HTTP status once the shell
  has streamed. With Cache Components that check belongs in `proxy`.

## Alternatives rejected

- **Keep management on the tenant host** (`admin.mawifoods.com.br`): rejected
  because the dashboard would be reachable from a host the tenant controls, and
  because a tenant's several addresses would each need their own management
  entry point.
- **Storefront by path only, no subdomain** (`menuza.com.br/store/<slug>`):
  rejected because it discards store addresses that already exist and are the
  tenant's own brand.
- **Everything in `Domain`, subdomains included**: rejected because
  `<slug>.<suffix>` is derivable from the slug; storing it duplicates the
  identifier and needs synchronisation.
- **Path on the main domain as canonical, with custom domains redirecting**:
  rejected because a tenant who configured their own domain would see their
  URLs redirect away from it.
- **Per-store sessions for the buyer**: rejected by ADR-0004; the model is
  multi-store from day one.

## Amendment — 2026-09-22

`proxy.ts` shipped fail-open: any host absent from `WEB_HOST_MAP` served the
main domain, so an arbitrary hostname could show the marketing site and, with
real login, the dashboard. That is reversed. Host resolution is now an explicit
allowlist — `WEB_MAIN_DOMAIN` is authoritative for the main domain, a
`storefront` entry in `WEB_HOST_MAP` is the storefront, and every other host is
denied with 404. Development hosts (`localhost`, `127.0.0.1`, `[::1]`) are the
only exception, and only outside production. Host admission is exactly
`WEB_HOST_MAP` + `WEB_MAIN_DOMAIN` + those development hosts: admitting a host
because it owns a `Domain` row, or because it matches a store subdomain, is not
implemented and remains MEN-225. This restores the fail-closed property the
Decision above describes.
