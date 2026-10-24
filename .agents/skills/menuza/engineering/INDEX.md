# engineering/ index

| File                   | Holds                                                                              | Keywords                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `monorepo.md`          | Workspaces, dependency direction, where a change belongs, scripts                  | monorepo, workspace, package, catalog, placement, turbo                                    |
| `backend.md`           | Request path, APIs, middleware, auth/sessions, db scope, worker, observability     | backend, orpc, middleware, request, worker, redis                                          |
| `stack.md`             | Locked stack, ADRs, technical pendencies                                           | stack, architecture, ADR, bun, prisma, orpc                                                |
| `route-stages.md`      | apps/web rendering stages, `ensureStatic`, dashboard caching/prefetch model, audit | route, ensureStatic, static, prefetch, private cache, dashboard suspense, app shell, cache |
| `checks.md`            | Every-change commands and the 12 acceptance scenarios                              | checks, acceptance, scenarios, done                                                        |
| `schema-migrations.md` | Prisma 8 migration loop, failure modes, data rules                                 | migration, prisma migrate, schema, contract, ref, column, backfill                         |
| `followups.md`         | Open technical work and the product gates                                          | follow-up, pending, backlog                                                                |

Cross-cutting invariants: `../SKILL.md`. Linear querying rules: `../tickets/README.md`.
