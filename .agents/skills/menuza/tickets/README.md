# Tickets

Linear is the work source of truth. Team **Menuza** (key `MEN`); issue ids are `MEN-###` strings passed as `id`.

**No ticket list, status or inventory lives in this repo.** Query Linear every time. A `MEN-###` in these docs is a citation pointing at the tracker, never a record of it.

## Querying

- `list_issues({ team: "Menuza", limit: 250 })` is the cheap path: fetch the whole team once and filter in code, rather than paging per status or per parent.
- `fields` is a closed whitelist. Useful: `id`, `title`, `status`, `statusType`, `priority`, `estimate`, `labels`, `assignee`, `project`, `parentId`, `createdAt`, `updatedAt`, `completedAt`, `url`. `identifier`, `state` and `relations` are **not** fields — `id` already is `MEN-###`, and state is `status` (display name) + `statusType` (`backlog | unstarted | started | completed | canceled | duplicate`).
- Status names are custom (`Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, `Canceled`, `Duplicate`). Filter on `statusType`, not the name.
- `list_issues` **never returns relations**. Read blockers with one `get_issue({ id, includeRelations: true })` per issue; they come back under `relations.blockedBy` / `relations.blocks` / `relations.relatedTo`.
- **Blocker and ordering live in ticket prose, not in relations.** The relations graph is barely used here, so an empty `blockedBy` does not mean the ticket is ready. Read the description and `list_comments` before judging what is next.
- When citing an issue, always pair the identifier with its title (e.g. `MEN-93 — Pedidos: maquina de estados completa`), id first for copy-paste.

## Roadmap epics

- **MEN-63 — Roadmap Menuza — MVP**: `MEN-69`..`MEN-115`. The scope in `../product/scope.md`.
- **MEN-64 — Roadmap Menuza — Backlog (pós-MVP imediato)**: `MEN-116`..`MEN-147`.
- **MEN-65 — Roadmap Menuza — Pós-MVP (fases futuras)**: `MEN-148`..`MEN-159`.
- `MEN-160`..`MEN-229` are standalone platform/engineering tickets, not children of an epic.

The MVP is done when the 12 acceptance scenarios pass, not when the cards are Done (`../engineering/checks.md`).

## Module map

| Area | Code home | Tickets |
| --- | --- | --- |
| Tenant isolation | `packages/db/scope`, `@menuza/orpc-server/tenant` | MEN-69, MEN-180 |
| Auth/sessions | `@menuza/orpc-server/auth`, `@menuza/shared/tenant` | MEN-75, MEN-167, MEN-213..216 |
| Store, team, audit | `@menuza/api-tenant` panel/account | MEN-70..74, MEN-106/107 |
| Storefront | `apps/web` `(storefront)` | MEN-77..79 |
| Catalog/kits/stock | `@menuza/api-commerce`, `packages/db` | MEN-80..83 |
| Cart/checkout | `@menuza/api-commerce` | MEN-84/85, MEN-113/114 |
| Coverage/freight | `@menuza/api-commerce` | MEN-86/87, MEN-115 |
| Scheduling/pickup/dispatch | `@menuza/api-commerce` | MEN-88/89, MEN-99 |
| Payments | `@menuza/api-commerce`, `apps/worker` | MEN-90..94, MEN-168 |
| Wallet | `packages/db`, order flow | MEN-95/96 |
| Orders | `packages/db`, order service | MEN-93 |
| Notifications | `apps/worker`, `Mailer` | MEN-100/101 |
| Customers/metrics | panel + exports | MEN-102..105 |
| Admin/SaaS billing | `@menuza/api-tenant` admin | MEN-106/107, MEN-110..112 |
| Infra/platform | `apps/*`, `packages/*` | MEN-160..229 |

The map above cites ids only, to point at the code home. Status, priority, ordering and what is next come from Linear.
