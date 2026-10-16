# Schema migrations

Prisma 8 (`@menuza/db`) migration runbook. The contract is the source; migrations are
explicit, committed packages under `packages/db/migrations/`. Mechanics live in
`packages/db/AGENTS.md`; this page is the loop and its failure modes.

## Loop

1. Edit `packages/db/prisma/contract.prisma`.
2. `bun run db:generate` (= `prisma contract emit`) — writes `contract.json` /
   `contract.d.ts` into the gitignored `prisma/generated/client/`.
3. `prisma migration plan --name <slug>` — inspect the planned package. **One real
   change = one migration package.** A plan with dozens of operations is wrong.
4. `prisma db migrate` — applies the edges. Then `prisma db migrate --advance-ref db`.
5. `prisma migration status` — must read "Up to date", with the new package listing
   `db` among its refs.
6. Commit the package **and** `migrations/snapshots/<hash>/` together, plus
   `migrations/app/refs/db.json`.

Then regenerate anything downstream of the contract: `bun run typegen`,
`apps/orpc-server/openapi/tenant.json` (its test asserts the file), and the panel
schemas in `packages/shared/src/panel/contracts.ts` when a field is exposed.

## Failure modes (each one is a wrong origin, not a broken database)

| Symptom | Cause | Fix |
| --- | --- | --- |
| `migration plan` reports far too many operations and warns that the default origin ref `db` "already has a migration leading to … Planning from it forks the migration graph" | `migrations/app/refs/db.json` is stale | Make it equal the `currentContract` from `prisma migration status`, then re-plan |
| `MIGRATION.REF_NOT_FOUND` | `--to <hash>` was passed for the freshly emitted contract | Pass `--from <hash>` only; a contract becomes a graph node only once a migration carries it |
| `MIGRATION.PATH_UNREACHABLE` on `prisma db migrate` | no edge joins the database's state to the target | Re-plan from the correct origin — migrate replays edges, it never invents one |
| the next plan forks again | the ref was not advanced | `prisma db migrate --advance-ref db` after every apply |

## Data rules

- Money is `Int` cents (ADR-0006); `Coupon.value` is cents for a fixed discount and a
  whole percent for a percentage one, disambiguated by `discountType`. UI converts at
  the edge (`apps/web/src/lib/format.ts`), never the contract.
- Enum-ish columns are `@@type("pg/text@1")` with generated CHECKs over lowercase
  ASCII slugs; pt-BR labels live only in the UI.
- `@@check` expressions must quote camelCase identifiers (`"priceCents" >= 0`).
- Every commerce model carries `tenantId` and `@@index([tenantId])`;
  `TENANT_SCOPED_MODELS` is derived from the contract, not hand-listed.
- A nullable column added for a new UI affordance (e.g.
  `Coupon.shippingDiscountPercent Int?`) keeps existing rows valid without a backfill;
  treat `null` as "not offered", not as `0`.
