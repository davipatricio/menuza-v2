# Kits: três tipos, preço no servidor, baixa por componente (MEN-82, MEN-83)

Status: done
Updated: S7

## Decisões fechadas

- Três tipos: `fixed` (quantidade travada por prato), `custom_quantities` (min/max por prato), `fixed_total` (só o total do kit travado).
- Grupo: nome + min/max opcionais. Prato sem grupo cai no grupo padrão, sem limites. Grupo vazio é recusado no save.
- Preço por kit. `fixed`: `baseCents` é o preço. `sum`: `max(baseCents, soma das variações)`, percentual incide sobre esse total, faixa progressiva por último.
- Faixas: `{minQuantity, percent}`, não cumulativas, somadas por kit no pedido, não por linha.
- Variação travada na escolhida pelo lojista. `allowSwap` por prato abre só as variações que ele marcou.
- Passo de quantidade por prato, default 1. Min e max são múltiplos do passo.
- Prato esgotado fica visível e bloqueado. Kit inalcançável obedece `unavailableBehavior`: `hide` ou `block`.
- `maxKitsPerOrder` opcional. Preço recalculado na hora do pagamento, sem trava.
- Página própria: slug + foto obrigatórios. SEO customizado fica fora (MEN-233).
- Cupom: escopo por kit via `CouponKit`. Cupom sem escopo incide sobre o subtotal já descontado quando `couponStackable` (default ligado).
- Complementos herdados do produto: gancho reservado, UI só quando o complemento de produto existir.

## Non-goals

- Kit dentro de kit.
- SEO customizado por kit (MEN-233). `SeoMeta.entityType` já aceita `kit`.
- UI de complemento. O checkout reserva o campo, nada renderiza.
- Duplicar kit (MEN-121), impressão (MEN-118), montador por IA (MEN-269).
- Modo "a partir" (MEN-159, cancelado).
- Substituir `mode` por `kind` na limpeza. `mode` fica na tabela; o código novo lê `kind`.
- Commit. Nenhuma fase commita.

## Assumptions

- verified: `Kit` (`0001_baseline.sql:162`) tem `id, tenantId, name, mode, available`. `mode` ∈ {`preselected`, `build_your_own`}.
- verified: `KitItem` (`:171`) tem `id, kitId, tenantId, variationId, quantity > 0`, único por `(kitId, variationId)`.
- verified: o painel só lê kits. `list_kits` em `crates/api-tenant/src/domains/tenant/subdomains/panel/kits.rs:60`, `kit_list` em `crates/persistence/src/tenant/panel/kits.rs:20`.
- verified: o checkout expande `KitItem` em `reserve_stock` (`crates/persistence/src/commerce/orders.rs:1249`) e confia no `unit_price_cents` do cliente (`resolve_line_price`, `:1157`).
- verified: `CreateOrderLine` (`crates/contract/src/commerce/orders.rs:171`) já aceita `kit_id`.
- verified: a UI é a lista em `apps/web/src/routes/dashboard/$storeSlug/catalog/kits/index.tsx` com o `Alert` de somente-leitura.
- verified: escritas de produto exigem `catalog:write` (`products.rs:642`). Kits seguem o mesmo.
- verified: `Coupon` tem escopo por `productIds` (`coupon_create_schema`, `crates/contract/src/mcp.rs:665`). Não conhece kit.
- unverified: existem linhas reais em `Kit`/`KitItem` em algum ambiente. O backfill trata como se existissem.

## Code map

- `crates/persistence/migrations/0001_baseline.sql:162` — `Kit`, `:171` `KitItem`, `:465` `SeoMeta.entityType`.
- `crates/persistence/migrations/0002_river_jobs.sql` — última migração. A próxima é `0003_kits.sql`.
- `crates/contract/src/tenant/panel/kits.rs` — `PanelKit`, `PanelKitsOutput`. Reescrito no S1.
- `crates/contract/src/tenant/panel/products.rs` — o `validate()` de produto é o modelo do `validate()` de kit.
- `crates/persistence/src/tenant/panel/kits.rs` — `kit_list`. Ganha `kit_get`, `kit_insert`, `kit_update`, `kit_archive`.
- `crates/persistence/src/commerce/orders.rs:1137` — `resolve_line_price`. `:1249` `reserve_stock`.
- `crates/api-tenant/src/domains/tenant/subdomains/panel/kits.rs` — router de um GET.
- `apps/web/src/features/catalog/components/product-form.tsx` — receita do form (TanStack Form + valibot + `fieldErrors`).
- `apps/web/src/features/catalog/components/kits-table.tsx` — filtros em memória, sem URL state.
- `apps/web/src/features/catalog/server/taxonomy-lists.functions.ts` — `listKitsFn`.
- `.agents/skills/menuza/features/catalog/README.md:20` — a seção de kits descreve dois modos. Fica errada.
- `apps/web/src/features/catalog/AGENTS.md` — não menciona kit.
- `crates/persistence/src/tenant/panel/AGENTS.md`, `crates/api-tenant/src/domains/tenant/subdomains/panel/AGENTS.md` — ditos por crate; conferir e completar.

## Modelo

### Banco (`0003_kits.sql`)

`Kit` ganha, tudo nullable ou com default: `slug`, `description`, `imageUrl`, `sortOrder int4 default 0`, `archived bool default false`, `kind`, `pricingMode`, `baseCents int4`, `percentOff int4`, `minItems int4`, `maxItems int4`, `maxKitsPerOrder int4`, `unavailableBehavior`, `couponStackable bool default true`, `updatedAt timestamp(3)`.

Backfill antes dos CHECKs: `kind` = `fixed` quando `mode='preselected'`, `fixed_total` quando `build_your_own`; `slug` = `id`; `pricingMode='fixed'`; `baseCents=0`; `unavailableBehavior='hide'`; `updatedAt=now()`.

CHECKs: `kind` ∈ {`fixed`, `custom_quantities`, `fixed_total`}; `pricingMode` ∈ {`fixed`, `sum`}; `unavailableBehavior` ∈ {`hide`, `block`}; `baseCents >= 0`; `percentOff` nulo ou entre 0 e 100; `minItems <= maxItems` quando ambos presentes.

Novas tabelas, todas com `tenantId` e FK `ON DELETE CASCADE`:

- `KitGroup`: `id, kitId, name, minItems, maxItems, sortOrder`.
- `KitItemVariation`: `id, kitItemId, variationId`. Único por `(kitItemId, variationId)`.
- `KitDiscountBand`: `id, kitId, minQuantity, percent`.
- `CouponKit`: `couponId, kitId`. Espelha o escopo por produto.

`KitItem` ganha: `productId`, `groupId`, `minQty`, `maxQty`, `step int4 default 1`, `allowSwap bool default false`, `sortOrder int4 default 0`. `quantity` passa a nullable. As linhas existentes mantêm `quantity` preenchido.

### Contrato

`PanelKit` (lista) ganha `slug, kind, pricingMode, baseCents, archived, updatedAt`. `PanelKitDetail` acrescenta `groups`, `items`, `bands`. `PanelKitGroup`, `PanelKitItem` (inclui `swapVariationIds`), `PanelKitBand`. `CreateKitInput` exigido por completo. `UpdateKitInput` é patch: campo ausente mantém, como `UpdateProductInput`.

`validate()` recusa: slug vazio, kind ou pricingMode fora do conjunto, `baseCents < 0`, `percentOff` fora de 0–100, min > max em qualquer nível, `step < 1`, min/max não múltiplos do passo, `quantity` presente fora do tipo `fixed`, grupo inexistente, `swapVariationIds` com `allowSwap=false`, faixa com `percent` fora de 1–100 ou `minQuantity < 2`, faixas sobrepostas, kit sem prato.

### Preço

Resolvido nesta ordem, no servidor e no preview:

1. `fixed` → `baseCents`. `sum` → `max(baseCents, soma das variações escolhidas)`.
2. Percentual do kit sobre esse total.
3. Faixa progressiva sobre o resultado, pela quantidade de kits no pedido.

## Steps

- [x] S1 Contrato de kit | files: `crates/contract/src/tenant/panel/kits.rs` | owner: implementer | verify: `cargo test -p contract && cargo clippy -p contract -- -D warnings` | P1
- [x] S2 Revisão do contrato | files: `crates/contract/src/tenant/panel/kits.rs` | owner: reviewer | verify: none (review) | P2
- [x] S3 Migração `0003_kits.sql` | files: `crates/persistence/migrations/0003_kits.sql`, `crates/persistence/.sqlx/**` | owner: implementer | verify: `bun run db:migrate && cargo sqlx prepare --workspace && cargo test -p persistence` | P3
- [x] S4 Frontend: schema, preço, form, lista | files: `apps/web/src/features/catalog/schemas/kit.ts`, `apps/web/src/features/catalog/lib/kit-price.ts`, `apps/web/src/features/catalog/components/kit-form.tsx`, `apps/web/src/features/catalog/components/kit-items-editor.tsx`, `apps/web/src/features/catalog/components/kit-preview.tsx`, `apps/web/src/features/catalog/components/kits-table.tsx`, `apps/web/src/features/catalog/server/kit-mutations.functions.ts`, `apps/web/src/routes/dashboard/$storeSlug/catalog/kits/**`, `apps/web/tests/kit-price.test.ts` | owner: implementer | verify: `bun test apps/web/tests/kit-price.test.ts && bunx oxfmt apps/web/src/features/catalog apps/web/src/routes/dashboard/\$storeSlug/catalog/kits && bunx oxlint apps/web/src/features/catalog apps/web/src/routes/dashboard/\$storeSlug/catalog/kits && bun run design:check` | P4
- [x] S5 CRUD do painel + cupom por kit | files: `crates/persistence/src/tenant/panel/kits.rs`, `crates/api-tenant/src/domains/tenant/subdomains/panel/kits.rs`, `crates/contract/src/tenant/panel/coupons.rs`, `crates/persistence/src/tenant/panel/coupons.rs`, `crates/openapi/tenant.json`, `apps/web/src/lib/api/**` | owner: implementer | verify: `cargo test --workspace && cargo run -p openapi -- --check && cargo clippy --workspace --all-targets -- -D warnings` | P5
- [x] S6 Vitrine, checkout e docs | files: `crates/persistence/src/commerce/orders.rs`, `crates/persistence/src/commerce/public.rs`, `crates/api-commerce/src/domains/commerce/subdomains/public/**`, `apps/web/src/routes/_storefront/menu/kit/$slug.tsx`, `.agents/skills/menuza/features/catalog/README.md`, `apps/web/src/features/catalog/AGENTS.md`, `crates/persistence/src/tenant/panel/AGENTS.md`, `crates/api-tenant/src/domains/tenant/subdomains/panel/AGENTS.md` | owner: implementer | verify: `cargo test --workspace && bun test && bun run typecheck && bun run build` | P6
- [x] S7 Revisão final + gate | files: todos os de S4, S5, S6 | owner: reviewer | verify: `cargo fmt --all --check && bun run fmt:check && bun run lint` | P7

## Parallel

- P1: S1
- P2: S2
- P3: S3
- P4: S4
- P5: S5
- P6: S6
- P7: S7

Nada correu em paralelo. **Desvio registrado:** S5 (backend CRUD) rodou antes de S4 (frontend) porque o client orval só existe depois das rotas — contratos primeiro. S6 também ganhou duas fatias que o plano original não previa: `CouponKit` entrou nos cupons (contrato, persistência, handler e checkout) e `GET /panel/stores/{storeSlug}/kit-options` nasceu para o seletor de prato do editor, que precisa de produto + variação + preço num só payload.

As fases entregues: contrato (S1) → revisão (S2) → `0003_kits.sql` + `.sqlx` (S3) → CRUD do painel, cupom por kit e openapi (S5) → frontend do painel (S4) → leituras públicas, checkout, vitrine e docs (S6) → gate final (S7).

## Docs e skills

- `.agents/skills/menuza/features/catalog/README.md` — reescrever a seção "Kits" (`:20`) para os três tipos, o preço e a regra de inalcançável. Atualizar "Code entry points" com as tabelas novas e as rotas.
- `.agents/skills/menuza/product/glossary.md:18` — "Kit" deixa de dizer "two modes".
- `apps/web/src/features/catalog/AGENTS.md` — acrescentar kit: schema, form, preview, a função pura de preço e o teste dela.
- `crates/persistence/src/tenant/panel/AGENTS.md` e `crates/api-tenant/src/domains/tenant/subdomains/panel/AGENTS.md` — registrar que kit agora escreve e que `kit_update` substitui os filhos inteiros numa transação.
- Nenhum `AGENTS.md` novo. Kit vive dentro de catálogo, painel e commerce; as regras novas cabem nos arquivos que já existem.

## Review

- S2 revisa o contrato antes de qualquer SQL. O reviewer confere o `validate()` contra a lista de invariantes desta página, não contra a memória.
- S7 revisa o comportamento: preço resolvido na ordem certa, `reserve_stock` expandindo a seleção enviada, cupom respeitando `CouponKit`, kit inalcançável obedecendo `unavailableBehavior`.
- Checkup de cada fase: os cenários 3 e 4 de `.agents/skills/menuza/engineering/checks.md` são o gate do S6. Antes disso, cada step só prova o próprio verify.

## Risks / Not doing

- `quantity` nullable (S3) quebra `reserve_stock` até o S6. Mitigação: o backfill preserva as linhas existentes e nenhum kit novo vai a produção antes do S6.
- `mode` e `kind` coexistem. O código novo lê `kind` e nada grava `mode`. A remoção de `mode` fica para uma migração posterior.
- A lista de kits hoje filtra em memória. O S4 troca por URL state; os filtros antigos (`availableOnly`, `usedOnly`, `minItems`) não têm equivalente e somem.
- Preço de kit no checkout ignora `unit_price_cents` do cliente. É mudança de confiança, deliberada, e o S7 confere que linha de produto continua como está.
