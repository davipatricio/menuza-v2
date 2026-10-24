# Follow-ups

Open work that is not a feature decision. **Linear is the only ticket store** — this file keeps no ticket list and no status, so nothing here goes stale. Query team `Menuza` for what is open (querying rules: `../tickets/README.md`).

## Product gates

The high-priority decisions in `../product/open-decisions.md` block detailed design of billing, gateways, wallet, stock reservation, scheduling, the order state machine, privacy and permissions. Surface the gap; do not invent an answer.

## Technical pendencies (`PRODUCT.md` §27)

- Validate Prisma on the Bun runtime in production; decide the Postgres adapter and its connection impact.
- Define the oRPC contract format (procedures vs streamable) and route-versioning strategy.
- Implement the `Mailer` interface with an SMTP driver and a SES stub.
- Migration lock for production (Prisma Migrate + advisory lock).
- Log, trace and audit retention/disposal policy (LGPD).
- Disaster recovery for a single VPS: snapshots plus a tested restore.
- VPS monitoring (CPU, RAM, disk, BullMQ) with basic alerts.

## Dashboard navigation and caching

- **App Shell is deferred by the auth gate.** `dashboard/[storeSlug]/layout.tsx` resolves the slug and session before rendering, so an unknown slug and a non-member are a 404 and a signed-out visitor is redirected. An App Shell is shared across links and cannot contain URL data, so the dashboard has no data-bearing shell. Splitting the layout to move that gate behind `<Suspense>` would create one, but changes the status/redirect behaviour of an unknown slug — a product decision, not a refactor.
- **`force-disabled` candidates.** `settings/*` (six rarely visited segments) are the first place `export const prefetch = 'force-disabled'` would pay. Nothing in scope uses it yet.
- **`navigation()` candidate.** The audit panel is the first place a cached subtree should render on navigation only. No route uses `navigation()` yet.
- **No server-side revalidation path.** Mutations are browser oRPC calls followed by `router.refresh()`, which clears only the current route's client cache. `'use cache: private'` entries on other routes expire by `cacheLife` `stale` (30s forms/editor, 300s lists) and `cacheTag` values are inert until a Route Handler or Server Action calls `revalidateTag`. Add that path before raising any `stale` above the staleness the owner accepts.
- **Model reference.** The full rule set lives in `route-stages.md` → `## Dashboard caching and prefetching`.

## Where the work stands

Ticket status, priority, estimates, epic membership and what comes next live in Linear only — fetch team `Menuza` once (`list_issues`, limit 250) and filter in code, then read the description and `list_comments` of each candidate, because ordering and blockers are written in the prose, not in the relations. What the code already does is documented per area under `../features/` and in `stack.md` / `../tickets/README.md`.
