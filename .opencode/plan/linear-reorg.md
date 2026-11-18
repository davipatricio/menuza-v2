# Linear reorg — team Menuza

Owner: orchestrator. Linear MCP writes only; no repo file touched except this plan.
State: done. User approved all three open decisions (close MEN-80 + T1; cancel the seven outdated; MEN-287..291 p3 / children p4).
Steps 1-6 [x]; verify re-read passed (247 issues, 181 open, 66 closed, 0 p0, 0 orphans).

## Goal

1. Priorities reflect the three roadmap lanes and the MVP critical path, with every non-default value stated.
2. Tickets the codebase fully settles close as Done, each with a comment naming the evidence.
3. Duplicates consolidate with a stated reason per pair.
4. Stack-outdated tickets close or get retitled to the real stack.
5. Every open issue has a parent; relations carry information, not topology noise.

## Rules

- A closure needs the ticket's own open-items list to be empty. A ticket whose body lists "Falta" stays open with a narrowed-scope comment.
- Exception: MEN-80 closes because its own body recommends "abrir ticket próprio e fechar MEN-80 com o que existe"; its successor T1 is created and parented before MEN-80 is closed.
- Every close gets a comment first: Done names the file, Duplicate names the target and why, Canceled names the replaced component.
- Priority: `1` = a store cannot transact without it. `2` = MVP required. `3` = post-MVP immediate lane, or an MVP-optional item. `4` = future. Roadmap parents stay MEN-63=2, MEN-64=3, MEN-65=4.
- Any issue whose priority changes from its current value must be named in Step 3. No implicit drops.
- Full `MEN-###` ids everywhere.

## Code facts (verified)

- PWA: `apps/web/src/sw.ts`, `serwistWorker()` in `apps/web/vite.config.ts`, `apps/web/src/offline/*`, `apps/web/src/lib/push-subscription.ts`, push routes in `crates/api-tenant/.../push/`, `push-notifications` queue in `crates/worker/src/queue.rs` + `push_dispatch.rs`. Gaps: `apps/web/public/manifest.webmanifest` has `"icons": []`; no producer enqueues `push-notifications`.
- Variations + stock: `crates/contract/src/tenant/panel/products.rs` (`ProductVariationInput`, `stock_mode`), `Variation` CHECK in `crates/persistence/migrations/0001_baseline.sql`, reservation `FOR UPDATE` in `crates/persistence/src/commerce/orders.rs`.
- Coupons: `crates/domain/src/coupon.rs`, `crates/contract/src/tenant/panel/coupons.rs` (`shippingDiscountPercent`, `firstPurchaseOnly`, `stackable`, `perCustomerLimit`). Missing: the concurrency test the ticket itself demands.
- TanStack Form: 10 files under `apps/web/src` import `@tanstack/react-form`; `apps/web/src/features/catalog/components/kit-form.tsx` and `apps/web/src/features/integrations/components/integration-settings-form.tsx` still `useState`.
- Store SEO: `crates/domain/src/seo.rs` (`apply_tokens`, `StoreSeoDefaults`, entity→store→default), `crates/contract/src/tenant/panel/seo.rs`, `apps/web/src/features/settings/components/seo-settings-form.tsx`. Tokens are `%store% %entity% %city%`; no live preview, coverage indicator, whole-store revert, robots/language.
- Sitemap: `GET /sitemap` exists (`crates/api-commerce/.../public/list_sitemap.rs`, `crates/persistence/src/commerce/public.rs`, `apps/web/src/server/server-api.ts`). Missing: a web route serving `/sitemap.xml`.
- Password auth: argon2 in `crates/domain/src/password.rs`; sessions in `crates/domain/src/session.rs`. Invite is a navigable stub (`apps/web/src/routes/dashboard/signup/_onboarding/convite.tsx`); `crates/api-tenant/.../panel/team.rs` is read-only. RBAC in MEN-71..MEN-73.
- Custom domains: `Domain` table + host resolution in `apps/web/src/server/tenant-resolve.ts`; no merchant screen to register one.
- oRPC: legacy contracts in `packages/shared` only; the runtime client is orval over `crates/openapi/*.json`.
- Absent: buyer login under `apps/web/src/routes/_storefront`, cart/checkout routes, `Review` table, feature-flag table, t3-env, `@tanstack/db`, BullMQ, Caddy, Redis consumer, Sentry in the Rust binaries.
- Compose: Postgres 18 + Redis (no consumer) + Jaeger.

## Step 1 — create (no moves in this step) [x]

- [x] E1 → MEN-305 `Gateways de pagamento: avaliar e escolher`, parent MEN-64, p3.
- [x] E2 → MEN-306 `Cobrança da plataforma: planos, pagamento e inadimplência`, parent MEN-63, p2.
- [x] E3 → MEN-307 `Plataforma: deploy, observabilidade e rollout`, parent MEN-64, p3.
- [x] E4 → MEN-308 `Contas, equipe e autenticação`, parent MEN-64, p3.
- [x] E5 → MEN-309 `IA e análise do lojista`, parent MEN-64, p3.
- [x] E6 → MEN-311 `SEO, conteúdo e aquisição`, parent MEN-64, p3.
- [x] T1 → MEN-312 `Catálogo: complementos (Addon/Complement) + testes de integração de variações`, parent MEN-63, p2.
- [x] MEN-310 (accidental double of MEN-307) closed as duplicate.

## Step 2 — reparent [x]

- [x] MEN-305 ← MEN-133, MEN-134, MEN-135, MEN-136, MEN-137, MEN-138, MEN-139, MEN-140.
- [x] MEN-306 ← MEN-110, MEN-111, MEN-112, MEN-181, MEN-217, MEN-218.
- [x] MEN-307 ← MEN-160, MEN-161, MEN-162, MEN-164, MEN-169, MEN-173, MEN-175, MEN-184, MEN-198, MEN-199, MEN-201, MEN-222, MEN-203.
- [x] MEN-308 ← MEN-214, MEN-215, MEN-216, MEN-226, MEN-227, MEN-228, MEN-285.
- [x] MEN-309 ← MEN-124, MEN-125, MEN-126, MEN-127, MEN-243, MEN-257, MEN-258, MEN-269, MEN-271, MEN-272, MEN-273, MEN-274.
- [x] MEN-311 ← MEN-144, MEN-145, MEN-230, MEN-231, MEN-232, MEN-233, MEN-234, MEN-235, MEN-236, MEN-237, MEN-245, MEN-246, MEN-247, MEN-248, MEN-253, MEN-254, MEN-255, MEN-256, MEN-278, MEN-283.
- [x] MEN-289 ← MEN-143, MEN-189, MEN-229.
- [x] MEN-290 ← MEN-153, MEN-156, MEN-239, MEN-275.
- [x] MEN-291 ← MEN-142, MEN-240.
- [x] MEN-288 ← MEN-148, MEN-242, MEN-270.
- [x] MEN-63 direct ← MEN-182.
- [x] MEN-64 direct ← MEN-193, MEN-195, MEN-202, MEN-221, MEN-241, MEN-244, MEN-249, MEN-250, MEN-251, MEN-252, MEN-284, MEN-168, MEN-204.
- [x] MEN-168 stays a MEN-64 direct child; MEN-143 and MEN-189 leave MEN-64 for MEN-289.

## Step 3 — priority table [x]

- [x] p1: MEN-84, MEN-90, MEN-108.
- [x] MEN-63 children, p2 default. Exceptions: p3 → MEN-102, MEN-103, MEN-104, MEN-105, MEN-113, MEN-114, MEN-267, MEN-279.
- [x] MEN-63 direct: MEN-182 p2, MEN-312 p2.
- [x] MEN-64 lane, p3 default. Exceptions: p2 → MEN-195; p4 → MEN-152, MEN-202, MEN-228, MEN-256, MEN-257, MEN-269, MEN-273, MEN-274, MEN-283.
- [x] MEN-64 direct extras, p3: MEN-193, MEN-221, MEN-241, MEN-244, MEN-249, MEN-250, MEN-251, MEN-252, MEN-284.
- [x] MEN-64 direct, p2: MEN-168 (kept current), MEN-204 → p3 default.
- [x] MEN-306 children: MEN-110, MEN-111, MEN-112, MEN-181, MEN-217, MEN-218 → p2.
- [x] MEN-307 children: MEN-160, MEN-164, MEN-198 → p2; MEN-161, MEN-162, MEN-169, MEN-173, MEN-175, MEN-184, MEN-199, MEN-201, MEN-222, MEN-203 → p3.
- [x] MEN-308 children: MEN-214, MEN-215 → p2; MEN-216, MEN-226, MEN-227, MEN-285 → p3; MEN-228 → p4.
- [x] MEN-305 children → p3.
- [x] MEN-309 children → p3 except MEN-124, MEN-126 → p2 and MEN-257, MEN-269, MEN-273, MEN-274 → p4.
- [x] MEN-311 children → p3 except MEN-256, MEN-283 → p4.
- [x] MEN-65 children: p4. MEN-287..MEN-291 p3; MEN-292, MEN-300 and every child of MEN-287..MEN-291 p4.
- [x] Epics: MEN-305/MEN-307/MEN-308/MEN-309/MEN-311 p3, MEN-306 p2.
- [x] p0 sweep: 0 open issues left at p0.

## Step 4 — closes [x]

Done (comment names the evidence):

- [x] MEN-80 — variations shipped; MEN-312 created first, parented to MEN-63 at p2.

Duplicate (comment + `duplicateOf`):

- [x] MEN-276 → MEN-280 (MEN-280's pipeline includes the WebP conversion).
- [x] MEN-183 → MEN-99 (both are the Spoke Dispatch MVP; MEN-99 adds the spreadsheet export).
- [x] MEN-147 → MEN-101 (same provider comparison; the MVP ticket owns the decision and inherits the deliverability criteria via comment).
- [x] MEN-141 → MEN-115 (near-identical text, one per lane).
- [x] MEN-235 → MEN-105 (rich snippets only exist once the reviews model does; MEN-105 owns it).
- [x] MEN-200 → MEN-221 (same TanStack Query cache work; MEN-221 owns prefetch + mutation invalidation).
- [x] MEN-310 → MEN-307 (accidental double from the epic batch).

Blocked, not duplicated:

- [x] MEN-203 `blockedBy` MEN-175. MEN-175's body explicitly says it is not a duplicate of MEN-203.

Canceled (comment names the replacement):

- [x] MEN-172 BullMQ → River (`crates/worker/src`, ADR-0008).
- [x] MEN-174 SMTP self-hosted + nodemailer → managed SES (MEN-302).
- [x] MEN-188 oRPC streaming → orval/OpenAPI client; exports stream over axum, not oRPC.
- [x] MEN-191 TanStack DB → query cache + IndexedDB persister (`apps/web/src/offline`).
- [x] MEN-211 Caddy `/commerce` `/tenant` → Vite proxy + `proxy-upstream.ts`; production proxy out of scope.
- [x] MEN-219 shared Redis cache → no application consumer of Redis.
- [x] MEN-223 Sentry source maps for the API → Rust binaries use `tracing`; no compiled JS bundle.

Retitle, keep open:

- [x] MEN-162 → `Postgres gerenciado + réplica de leitura (produção)`.
- [x] MEN-164 → `Redis: persistência e senha em produção`.
- [x] MEN-175 → `Feature flags por tenant em Postgres`.
- [x] MEN-198 → `Envs tipadas na web e nas APIs (sem t3-env)`.
- [x] MEN-199 → `Rate limit nas APIs públicas (sem Redis)`.
- [x] MEN-204 → `bun test: cobertura de regras de negócio` (body keeps a live item; not closed).
- [x] MEN-214 → `Auth do comprador na vitrine (e-mail + senha, visitante por padrão)`.
- [x] MEN-216 → `Admin do Menuza: acesso cross-tenant com guard`.
- [x] MEN-217 → `Webhooks Asaas de pedidos`.
- [x] MEN-218 → `Webhooks Asaas do SaaS`.

Comment only (partial; the comment names exactly what is missing):

- [x] MEN-77 icons do manifest + no push producer (producer is MEN-100).
- [x] MEN-78 merchant custom-domain screen.
- [x] MEN-81 stock precedence, return-idempotency test, CI integration job.
- [x] MEN-97 concurrency test for `perCustomerLimit`.
- [x] MEN-168 outbound HMAC layer (inbound Pagar.me path exists).
- [x] MEN-193 kit + integration forms.
- [x] MEN-195 per-action offline coverage.
- [x] MEN-215 invites + RBAC.
- [x] MEN-221 remaining routes and typed invalidation.
- [x] MEN-229 grants table, revocation, audit (authorize/consent/token shipped).
- [x] MEN-253 preview, coverage, revert, robots/language, extra tokens.
- [x] MEN-263 SEO screens for category, department, tag, kit, coupon.
- [x] MEN-274 rewrite scope: quick single orders, PWA install, retention.

## Step 5 — relations [x]

- [x] MEN-84 blocks MEN-85, MEN-86, MEN-87, MEN-88, MEN-90, MEN-94, MEN-98, MEN-251.
- [x] MEN-90 blocks MEN-91, MEN-94, MEN-98.
- [x] MEN-86 relatedTo MEN-87. MEN-115 relatedTo MEN-182. MEN-280 relatedTo MEN-173.
- [x] MEN-270 relatedTo MEN-88, MEN-89, MEN-249, MEN-250.
- [x] MEN-271 relatedTo MEN-103. MEN-272 relatedTo MEN-273.
- [x] MEN-257 relatedTo MEN-269, MEN-258. MEN-284 relatedTo MEN-105.
- [x] MEN-312 relatedTo MEN-80, MEN-298.

## Step 6 — verify [x]

- [x] Re-read every mutated issue: status, parent, priority, title.
- [x] No open issue at p0.
- [x] Every closed issue has a comment; MEN-80's comment links MEN-312.
- [x] Orphan check: 0 open issues without a parent outside MEN-63/MEN-64/MEN-65.
- [x] Epic bodies list their children (MEN-307, MEN-288, MEN-289, MEN-290, MEN-291, MEN-311).

## Decisions (user, resolved)

1. MEN-80 closes; MEN-312 carries complements + integration tests. Approved.
2. The seven stack-outdated tickets are canceled with a reason comment. Approved.
3. MEN-287..MEN-291 move to p3, children to p4. Approved.

## Out of scope

- No repo files, no commits, no deletion. Closes use Done/Duplicate/Canceled and stay restorable.
- No PRODUCT.md or skill-doc edits.
