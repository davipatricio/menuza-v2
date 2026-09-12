# @menuza/db

- Owns Prisma schema, migrations, generated client, and the database client lifecycle.
- The generated client lives in `prisma/generated/client/` and is gitignored.
- Migrations are explicit and committed under `prisma/migrations/`. No auto-migration at app startup.
- Singleton Prisma client lives in `src/client.ts`. Importing consumers must call `disconnectDb()` on shutdown.
- Tenant-scoped queries MUST include an explicit `where: { tenantId }`. Middleware does NOT scope Prisma automatically.
- Datasource URL comes from `DATABASE_URL` via `prisma.config.ts`; runtime callers must export it before importing the client.
- Adapter: `@prisma/adapter-pg` (driver-adapter based). No `prisma://` Accelerate URL.
- Never use `@prisma/client/extension` patterns that bypass the driver adapter.

## Distribution

- Source-based workspace. Consumers import the TS source directly via Bun/Next.
- `tsdown` was evaluated and rejected: Prisma 7's generated client carries runtime-config
  artifacts (inline schema, engine metadata) that must not be inlined into a bundle.
