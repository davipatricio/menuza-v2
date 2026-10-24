# Checks

Run these before calling a Menuza feature done. The commands and the 12 scenarios are the bar; a green card is not.

## Every change

- `bun run typecheck` — `bun check` (Bun's built-in TS 7 checker) across workspaces (after `db:generate` + `typegen`).
- `bun test` — workspace-policy + unit tests (no infra).
- `bun run lint` and `bun run fmt:check` — oxlint + oxfmt via turbo. Both are green
  repo-wide today. Still lint your own paths first (`bunx oxfmt <paths>` then
  `bunx oxlint <paths>`): the pre-commit hook only checks staged files, so an unstaged
  file you created stays unseen.
  `anti-slop/require-readable-spacing` autofixes (`bunx oxlint --fix <paths>`); re-run the
  formatter afterwards and confirm a second pass changes nothing. Every `as` needs a
  `SAFETY:` comment, no `unknown` parameter, no runtime `typeof` narrowing (`anti-slop`).
- Contract changed? Follow `schema-migrations.md`, then regenerate `typegen` and
  `apps/orpc-server/openapi/tenant.json`.
- `/dashboard` UI changed? `bun run design:check` (a root script; checks the dashboard
  against `apps/web/DESIGN.md`).
- `bun run build` — Prisma generate, Next typegen, Next build with type checking (never `ignoreBuildErrors`).
- If the change touched a route in `apps/web`, read the build's route table against `route-stages.md`.
- No secret in `NEXT_PUBLIC_*`; tenant-scoped queries carry an explicit `where.tenantId`; user-facing copy is `pt-BR`.

## The 12 acceptance scenarios (`PRODUCT.md` §24)

MVP is done only when all twelve pass. These are the product's definition of ready.

1. A user in two tenants cannot access the other tenant's data or balance.
2. A member override beats the role without letting the caller escalate their own privileges.
3. Two concurrent purchases do not consume the same last controlled unit.
4. A kit respects its minimums/maximums and discounts exactly its components.
5. A repeated payment confirmation does not duplicate commission, cashback or dispatch.
6. A pay-on-delivery order enters fulfilment, allows manual dispatch, and only earns commission/cashback after receipt is recorded.
7. A mixed payment loses no balance on failure and cannot spend the same balance twice.
8. Checkout computes coverage, the cheapest valid freight rule, discounts and time reproducibly.
9. A scheduled order is not delivered immediately because it was paid before its date.
10. An integration failure is visible and recoverable without duplicating the logistics request.
11. Notifications respect preferences, permissions and the recipient's tenant.
12. Inactivation, export and deletion preserve financial integrity and defined retention.

## Feature-specific

Each feature file carries its own checks; they all point back to the scenarios above. Cross-cutting ones:

- Wallet balance changes are never silent edits — they leave a financial history (`../features/payments/README.md`).
- A permission change, a wallet adjustment and a support session each leave an audited record (`../features/stores-and-teams/audit.md`).
- A logistics request is idempotent: a retry or duplicate webhook never issues it twice (`../features/integrations/README.md`).
- A nutrition label is published only when all 10 constituents, a positive portion, servings and a household measure are present; %VD comes from the rounded portion and the lupa from per-100 g/mL (`../features/catalog/nutrition.md`).
- An unpublished nutrition label never reaches the public payload; `listMenu` stays lean (`../features/catalog/nutrition.md`).
- At 375 px the nutrition table fits its card without horizontal overflow and the product tab strip has no vertical scrollbar (`../features/catalog/nutrition.md` → Mobile).
