# @menuza/db

- Owns the Prisma 8 data contract, migration packages, emitted contract artifacts,
  and the database client lifecycle.
- Contract source: `prisma/contract.prisma`. Emitted artifacts (`contract.json`,
  `contract.d.ts`) land in `prisma/generated/client/` and are gitignored.
  Re-run `bun run db:generate` (=`prisma contract emit`) after every contract edit.
- Migrations are explicit and committed under `migrations/` (Prisma 8 layout:
  `migrations/app/<ts>_<name>` + `migrations/snapshots/<hash>`). No auto-migration
  at app startup. Day-to-day loop: edit contract → `prisma contract emit` →
  `prisma migration plan --name foo` → review the planned package → `prisma db migrate --advance-ref db`.
- The `db` ref anchors `migration plan`'s origin; `db migrate` without
  `--advance-ref` (e.g. CI deploys) must not move it.
- Singleton client lives in `src/client.ts` (`postgres<Contract>(...)`, lazy
  connection). Importing consumers must call `disconnectDb()` on shutdown.
  Use `pingDb()` for readiness probes.
- Query spans: `src/otel-middleware.ts` records one CLIENT span per query/execute, but
  only when a span is already active. Statement text is truncated; bound parameters are
  never recorded.
- Tenant-scoped queries MUST include an explicit `where` on `tenantId`. Middleware
  does NOT scope queries automatically.
- `DATABASE_URL` comes from the repo-root `.env` in both places that need it:
  `prisma.config.ts` self-loads it via `process.loadEnvFile`, and runtime callers
  must export it before importing the client (`bun --env-file-if-exists=...` wrappers).
- Runtime: `@prisma/orm-postgres` (ships its own `pg` binding). No driver adapter,
  no `prisma://` Accelerate URL.
- Timestamps: `Timestamp(3)` columns encode/decode as `Temporal.PlainDateTime`
  (UTC-naive to match values written by the old v7 client). Bun ships `Temporal`;
  Node <26.8 would need `temporal-polyfill`.
- No `@default(cuid())` or `@updatedAt` in v8 contracts: seed/scripts set `id`
  (randomUUID) and `updatedAt` explicitly.

## Distribution

- Source-based workspace. Consumers import the TS source directly via Bun/Next.
- `tsdown` was evaluated and rejected: contract artifacts (`contract.json` imported
  with `with { type: "json" }`) and the runtime's target codecs must not be inlined
  into a bundle.
