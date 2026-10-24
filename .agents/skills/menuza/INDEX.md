# menuza skill index

`SKILL.md` is the router; this is the flat keyword map. Find the keyword, open the path.

## Folders

- `product/` — vision, tenancy, scope, open decisions, glossary.
- `features/` — one folder per product area, each with its own `INDEX.md`.
- `engineering/` — stack, route rendering stages, checks, follow-ups.
- `tickets/` — how to query Linear, the roadmap epics, the ticket → module map.

## Keyword map

| Keyword                                                                                      | Path                                                 |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| vision, positioning, who pays, competitor, Octofood                                          | `product/meaning.md`                                 |
| plans, commission, trial, pricing, delinquency                                               | `product/meaning.md`                                 |
| tenant, isolation, RLS, membership, store signup, PF/PJ                                      | `product/tenancy.md`                                 |
| MVP, roadmap, in scope, out of scope, MEN-63/64/65                                           | `product/scope.md`                                   |
| open, pending, blocking, decision, formula                                                   | `product/open-decisions.md`                          |
| glossary, term, pt-BR label, entity, model name                                              | `product/glossary.md`                                |
| role, permission, cargo, override, capability, team                                          | `features/stores-and-teams/roles-and-permissions.md` |
| login, session, argon2, cookie, logout, register                                             | `features/stores-and-teams/auth.md`                  |
| audit, event catalog, retention, actor                                                       | `features/stores-and-teams/audit.md`                 |
| storefront, vitrine, PWA, subdomain, custom domain, theming                                  | `features/storefronts/README.md`                     |
| product, variation, complement, nutrition, favorite, review                                  | `features/catalog/README.md`                         |
| kit, pre-selected, build-your-own, monte seu kit                                             | `features/catalog/README.md`                         |
| stock, inventory, reservation, oversell, unlimited                                           | `features/catalog/README.md`                         |
| checkout, cart, guest, minimum order, recipient                                              | `features/payments/README.md`                        |
| gateway, Asaas, Pix, boleto, card, voucher                                                   | `features/payments/README.md`                        |
| wallet, cashback, credit, balance, reversal                                                  | `features/payments/README.md`                        |
| freight, shipping, coverage, CEP, radius, distance                                           | `features/delivery/README.md`                        |
| schedule, agendado, pickup, retirada, cutoff, dispatch, Spoke                                | `features/delivery/README.md`                        |
| order, state machine, paid, refund, retry                                                    | `features/orders/README.md`                          |
| coupon, promotion, discount, stacking, money mask, form validation                           | `features/orders/README.md`                          |
| customer, export, birthday, KPI, dashboard, marketing                                        | `features/customers/README.md`                       |
| notification, push, email, preference, channel                                               | `features/notifications/README.md`                   |
| admin, support, SaaS billing, split, plan limits                                             | `features/admin/README.md`                           |
| integration, Spoke, Lalamove, Bling, pixel, GA4, webhook                                     | `features/integrations/README.md`                    |
| stack, architecture, ADR, monorepo, bun, prisma, orpc                                        | `engineering/stack.md`                               |
| migration, prisma migrate, schema change, contract emit, ref                                 | `engineering/schema-migrations.md`                   |
| design system, tokens, dashboard UI, component recipe, ToggleGroup, AlertDialog, money entry | `apps/web/DESIGN.md`                                 |
| monorepo, workspace, package, catalog, where does it belong                                  | `engineering/monorepo.md`                            |
| backend, request path, middleware, auth middleware, worker, redis, orpc server               | `engineering/backend.md`                             |
| route, ensureStatic, static, prefetch, private cache, dashboard suspense, app shell, cache   | `engineering/route-stages.md`                        |
| checks, acceptance, scenarios, done, verify                                                  | `engineering/checks.md`                              |
| follow-up, pending tech, backlog                                                             | `engineering/followups.md`                           |
| ticket, MEN-, Linear, epic, module map                                                       | `tickets/README.md`                                  |
