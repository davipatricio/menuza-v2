# engineering/ index

| File                   | Holds                                                                              | Keywords                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `monorepo.md`          | Workspaces, dependency direction, where a change belongs, scripts                  | monorepo, workspace, package, catalog, placement, turbo                                    |
| `backend.md`           | Request path, APIs, middleware, auth/sessions, db scope, worker, observability     | backend, orpc, middleware, request, worker, redis                                          |
| `stack.md`             | Locked stack, ADRs, technical pendencies                                           | stack, architecture, ADR, bun, prisma, orpc                                                |
| `route-stages.md`      | apps/web rendering stages, `ensureStatic`, dashboard caching/prefetch model, audit | route, ensureStatic, static, prefetch, private cache, dashboard suspense, app shell, cache |
| `dashboard-search.md`  | Dashboard palette, `panel.search` contract, ranking, quick actions                 | global search, command palette, Ctrl/Cmd+K, search panel, quick actions                    |
| `checks.md`            | Every-change commands and the 12 acceptance scenarios                              | checks, acceptance, scenarios, done                                                        |
| `database.md`          | Local Postgres on Podman, migration loop, ledger, troubleshooting                  | database, db, postgres, podman, psql, migrate, sqlx, ledger, seed                          |
| `schema-migrations.md` | sqlx migration loop, failure modes, data rules                                     | migration, sqlx migrate, schema, contract, ref, column, backfill                           |
| `followups.md`         | Open technical work and the product gates                                          | follow-up, pending, backlog                                                                |

Cross-cutting invariants: `../SKILL.md`. Linear querying rules: `../tickets/README.md`.
