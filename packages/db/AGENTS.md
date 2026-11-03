# @menuza/db

Historical husk, not a runtime package.

- No client, no query layer, no scripts beyond `fmt`/`fmt:check`/`lint`/`lint:fix`. The
  Prisma client and the Bun APIs that used it are deleted, and nothing imports
  `@menuza/db`.
- What remains: `prisma/contract.prisma` (the schema the sqlx baseline was derived from)
  and `migrations/` (the Prisma 8 migration packages, kept as history). `migrations/**`
  is excluded from formatting.
- The live schema is `crates/persistence/migrations/0001_baseline.sql`, and every future
  change lands there as a new append-only file. Edit the SQL, not the contract.
- Migrations run as a deploy step (`bun run db:migrate` = `cargo sqlx migrate run`), never
  on boot.
- The contract stays readable as documentation: money is `Int` cents (ADR-0006),
  timestamps are `Timestamp(3)`, enum-ish columns are `text` + CHECK over lowercase ASCII
  slugs, and every commerce model carries `tenantId` plus `@@index([tenantId])`.
- Do not add models, migrations or a client here. A schema change that edits both this
  directory and `crates/persistence` is a review error, not a sync step.
