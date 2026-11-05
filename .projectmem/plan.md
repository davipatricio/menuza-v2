# menuza-v2 — plan

> Editable **intent** file: ideas + plans — what we _mean to do_.
> This is NOT the event log. `events.jsonl` -> `summary.md` records what
> _happened_; this file records what we _intend_. The AI reads it at
> session start and edits it directly (like `PROJECT_MAP.md`): add ideas
> and plans, check items off, move done work down to Shipped. Plans are
> never logged as events.

## Ideas

_Loose thoughts, not yet committed to._

## Active plans

### Kits — três tipos, estoque por componente (MEN-82, MEN-83)

Estado hoje: `Kit`/`KitItem` mínimos (nome, modo, disponível, `variationId` +
quantidade), `GET /panel/stores/{slug}/kits` só de leitura, página do dashboard
só lista. O checkout já expande `KitItem` para reservar estoque, mas o preço do
kit vem do cliente e nada valida mínimos, tamanhos ou desconto.

O fundador definiu três tipos, todos com grupos/seções opcionais:

- `fixed` — composição fechada. Cada prato tem quantidade fixa. O comprador
  só escolhe quantos kits. É o pré-selecionado do PRODUCT.md §7.1.
- `custom_quantities` — os pratos são pré-definidos, mas cada um carrega
  min/max (min 0 = opcional, max nulo = ilimitado) e o kit tem min/max total.
  Ex.: "Kit Hipertrofia" com seções "Até 30g" e "Até 60g".
- `fixed_total` — pratos elegíveis sem min/max por prato; só o total do kit
  é travado (ex.: "10 almoços", min = max = 10).

`build_your_own` do banco vira o terceiro. O tipo `fixed` cobre o caso de
quantidade fixa por prato; o range vive nos outros dois.

Ordem: contrato → banco → **frontend (form + validações)** → CRUD do painel
→ vitrine → checkout.

#### Fase 0 — Decisões fechadas

- [x] Três tipos: `fixed`, `custom_quantities`, `fixed_total`
- [x] Grupos: nome + min/max opcionais; prato sem grupo cai no grupo padrão
- [x] Passo de quantidade por prato, default 1; min/max múltiplos do passo
- [x] Preço por kit: `fixed` (baseCents é o preço) ou `sum`
      (max(baseCents, soma) − percentual). Percentual e faixa incidem sobre
      o total já resolvido, faixa por último.
- [x] Variação travada na escolhida pelo lojista; `allowSwap` por prato abre
      a lista de variações que o lojista marcou
- [x] Kit inalcançável: `unavailableBehavior` por kit (`hide` | `block`);
      prato esgotado fica visível e bloqueado
- [x] Faixas progressivas percentuais, não cumulativas, por kit no pedido
- [x] Cupom com escopo por kit; cupom sem escopo incide sobre o subtotal
      do kit já descontado; `couponStackable` por kit, default ligado
- [x] `maxKitsPerOrder` opcional; preço recalculado na hora do pagamento
- [x] Página própria: slug + foto obrigatórios; SEO customizado fica fora
- [x] Kit só referencia produto, nunca outro kit
- [x] Complementos herdados do produto: gancho reservado, UI só quando o
      complemento de produto existir

Modelo de dados alvo (migração `0003_kits.sql`):

- `Kit`: slug, description, imageUrl, sortOrder, archived, kind, pricingMode,
  baseCents, percentOff, minItems, maxItems, maxKitsPerOrder,
  unavailableBehavior, couponStackable, updatedAt
- `KitGroup`: name, minItems, maxItems, sortOrder
- `KitItem`: productId, variationId (default), groupId, quantity (tipo fixed),
  minQty, maxQty, step, allowSwap, sortOrder
- `KitItemVariation`: as variações alternativas marcadas pelo lojista
- `KitDiscountBand`: minQuantity, percent
- `CouponKit`: escopo de cupom por kit (espelha o escopo por produto)

#### Fase 1 — Contrato (OpenAPI primeiro)

- [ ] `PanelKit`, `PanelKitDetail`, `PanelKitSize`, `PanelKitGroup`,
      `PanelKitItem`, `PanelKitOption`, `PanelKitBand`
- [ ] `CreateKitInput` / `UpdateKitInput` (patch parcial) e `validate()` no Rust
- [ ] Códigos de erro no catálogo fechado, sem inventar código novo sem necessidade
- [ ] `cargo run -p openapi` + `bun run api:generate`

Verify: `cargo run -p openapi -- --check` limpo e client gerado sem diff manual.

#### Fase 2 — Migração `0003_kits.sql`

- [ ] `Kit`: slug, description, imageUrl, sortOrder, archived, sizeMode,
      pricingMode, minItems, maxItems, maxPerProduct, percentOff, updatedAt
- [ ] `KitSize`, `KitGroup`, `KitOption`, `KitDiscountBand`
- [ ] `KitItem` ganha `groupId`; CHECKs de coerência; índices por tenant
- [ ] Backfill do que existir em `Kit`/`KitItem` (expand/contract)

Verify: `cargo sqlx prepare --workspace`, `cargo test -p persistence`.

#### Fase 3 — Frontend: lista + editor + validação

- [ ] `schemas/kit.ts` em valibot com as invariantes cruzadas
- [ ] Lista com filtros na URL (`nuqs`), colunas reais, ações por linha
- [ ] Rotas `catalog/kits/new.tsx` e `catalog/kits/$kitId.tsx` (abas)
- [ ] Form: identidade, composição/elegibilidade, regras, preço e faixas
- [ ] Preview do comprador com validação ao vivo
- [ ] Server functions de leitura/escrita

Verify: `bun run typecheck`, `bunx oxfmt`+`oxlint` nos paths, `bun run design:check`,
375 px sem overflow.

#### Fase 4 — Backend do painel

- [ ] Persistência: `kit_get`, `kit_create`, `kit_update` (transação que
      substitui tamanhos/grupos/itens/faixas), `kit_archive`
- [ ] Handlers + rotas + openapi, capacidade `catalog:write`
- [ ] Testes unitários do validador (mínimos, grupos, faixas, composição)

Verify: `cargo test --workspace`, openapi check.

#### Fase 5 — Vitrine

- [ ] `GET /public/kits` e `/public/kits/{slug}` no commerce
- [ ] Disponibilidade calculada (soma dos elegíveis em estoque ≥ mínimo)
- [ ] Rota `/menu/kit/$slug` com montador, limites ao vivo e esgotado
- [ ] Card/entrada de kits no cardápio

Verify: teste "kit nunca é oferecido com mínimos inalcançáveis".

#### Fase 6 — Checkout

- [ ] `createOrder` recalcula preço do kit (kit + tamanho + seleção)
- [ ] Valida mínimos contra o estoque atual, dentro da transação
- [ ] Reserva expande a seleção escolhida, não a composição fixa
- [ ] Cenários 3 e 4 de `engineering/checks.md` verdes

Verify: testes de concorrência e de desconto; `bun run build`.

## Next

_Queued, but not started._

O plano de execução de kits saiu daqui. A versão viva, com passos,
owners e verificação, está em `.opencode/plan/kits.md`.

### Plano de execução — Kits (MEN-82, MEN-83)

Cada fase termina verde antes da próxima começar. Nenhuma fase commita.

#### Fase 1 — Contrato (`crates/contract`)

Reescrever `crates/contract/src/tenant/panel/kits.rs`. O `PanelKit` atual
(5 campos) é a linha da lista e continua existindo; o detalhe é novo.

- `PanelKit`: acrescenta `slug`, `kind`, `pricingMode`, `baseCents`,
  `archived`, `updatedAt`. Mantém `mode` só como alias de leitura até a
  Fase 4 trocar a query.
- `PanelKitDetail`: o kit + `groups`, `items`, `bands`.
- `PanelKitGroup`: `id`, `name`, `minItems`, `maxItems`, `sortOrder`.
- `PanelKitItem`: `id`, `productId`, `variationId`, `groupId`, `quantity`,
  `minQty`, `maxQty`, `step`, `allowSwap`, `swapVariationIds`, `sortOrder`.
- `PanelKitBand`: `minQuantity`, `percent`.
- `CreateKitInput` / `UpdateKitInput` (patch: campo ausente = mantém,
  espelha `UpdateProductInput`).
- `validate()` cobre: slug, kind ∈ {fixed, custom_quantities, fixed_total},
  pricingMode ∈ {fixed, sum}, baseCents ≥ 0, percentOff 0–100, min ≤ max
  em kit, grupo e prato, step ≥ 1, min/max múltiplos do passo, quantity
  só no tipo fixed, grupo referenciado existe, swapVariationIds só quando
  allowSwap, faixa com percent 1–100 e minQuantity ≥ 2, faixas não
  sobrepostas, ao menos um prato.
- Testes unitários do `validate()` no próprio arquivo.

Verify: `cargo test -p contract`, `cargo clippy -p contract -- -D warnings`.

#### Fase 2 — Migração `0003_kits.sql`

Expand/contract. Não edita `0001`.

- `ALTER TABLE "Kit" ADD` slug, description, imageUrl, sortOrder, archived,
  kind, pricingMode, baseCents, percentOff, minItems, maxItems,
  maxKitsPerOrder, unavailableBehavior, couponStackable, updatedAt.
  Tudo nullable ou com default, para as linhas atuais sobreviverem.
- Backfill: `kind` a partir de `mode` (`preselected` → `fixed`,
  `build_your_own` → `fixed_total`), `slug` a partir do `id`,
  `pricingMode='fixed'`, `baseCents=0`, `updatedAt=now()`.
- CHECKs novos só depois do backfill.
- `CREATE TABLE` `KitGroup`, `KitItemVariation`, `KitDiscountBand`,
  `CouponKit`. Todas com `tenantId`, FK com `ON DELETE CASCADE`, índice
  por tenant.
- `ALTER TABLE "KitItem" ADD` productId, groupId, minQty, maxQty, step,
  allowSwap, sortOrder. `quantity` passa a nullable.
- `mode` fica na tabela até uma migração posterior; o código novo lê `kind`.

Verify: `bun run db:migrate`, `cargo sqlx prepare --workspace`,
`cargo test -p persistence`.

#### Fase 3 — Frontend (form, validação, lista)

Espelha o editor de produto (`product-form.tsx`, `product-tabs.tsx`).

- `apps/web/src/features/catalog/schemas/kit.ts`: valibot com as mesmas
  invariantes do `validate()` Rust. Mensagens em pt-BR.
- `apps/web/src/features/catalog/lib/kit-price.ts`: função pura que resolve
  o preço (`fixed` → baseCents; `sum` → max(baseCents, soma) e depois o
  percentual). Um teste em `apps/web/tests/kit-price.test.ts`.
- `apps/web/src/features/catalog/components/kit-form.tsx`: abas
  Identidade, Composição, Preço, Regras. Por tipo, esconde os campos que
  não se aplicam (quantity só no fixed, min/max por prato só no
  custom_quantities).
- `kit-items-editor.tsx`: grupos e pratos, com seletor de produto e de
  variação, passo, allowSwap e a lista de variações alternativas.
- `kit-preview.tsx`: o que o comprador veria, com a validação ao vivo
  (mínimos, múltiplos do passo, total).
- Rotas finas: `catalog/kits/new.tsx`, `catalog/kits/$kitId.tsx`.
  `index.tsx` troca o `Alert` de somente-leitura por ações.
- `kits-table.tsx` migra para `DataTable` + `dashboardTableFeatures`,
  filtros na URL via `nuqs` (`schemas/kit-search.ts`), rótulos pt-BR.
- `server/kit-mutations.functions.ts`: create/update chamando o painel.
  Enquanto a Fase 4 não existe, o server function devolve o erro real da
  API; sem mock.

Verify: `bun run typecheck`, `bunx oxfmt` + `bunx oxlint` nos paths,
`bun run design:check`, `bun test apps/web/tests/kit-price.test.ts`.

#### Fase 4 — CRUD do painel

- `crates/persistence/src/tenant/panel/kits.rs`: `kit_get`, `kit_insert`,
  `kit_update` (transação que substitui grupos, itens, variações
  alternativas e faixas), `kit_archive`. Tudo com `&TenantId` primeiro.
- `crates/api-tenant/.../panel/kits.rs`: POST, GET `/{kitId}`, PUT
  `/{kitId}`, DELETE `/{kitId}` (arquiva). `catalog:write` nas escritas.
  `list_kits` passa a ler `kind`.
- `CouponKit` entra no create/update de cupom como `kitIds`, espelhando
  `productIds`.
- OpenAPI regenerado: `cargo run -p openapi`, `bun run api:generate`.

Verify: `cargo test --workspace`, `cargo run -p openapi -- --check`,
`cargo clippy --workspace --all-targets -- -D warnings`.

#### Fase 5 — Vitrine

- `GET /public/kits` e `GET /public/kits/{slug}` no commerce. A
  disponibilidade é calculada: soma do estoque elegível ≥ mínimo do kit e
  de cada grupo. `unavailableBehavior='hide'` tira da lista.
- Rota `apps/web/src/routes/_storefront/menu/kit/$slug.tsx` com o montador:
  grupos, passo, variação travada ou lista marcada, esgotado visível.
- Card de kit no cardápio, com badge (MEN-268 já cobre a imagem).

Verify: teste "kit com mínimo inalcançável não aparece quando `hide`".

#### Fase 6 — Checkout

- `reserve_stock` (`orders.rs:1246`) passa a expandir a seleção enviada,
  não a composição fixa. O `KitItem` fixo continua valendo para o tipo
  `fixed`.
- `resolve_line_price` (`:1137`) recalcula pelo `kit-price`: ignora
  `unit_price_cents` do cliente quando a linha é de kit.
- Valida mínimos, passo e `maxKitsPerOrder` dentro da transação.
- Cupom com `CouponKit` só incide nos kits listados; cupom sem escopo
  incide sobre o subtotal já descontado quando `couponStackable`.

Verify: cenários 3 e 4 de `engineering/checks.md` com teste de
concorrência; `bun run build`.

#### Fora deste plano

Kit dentro de kit, SEO customizado por kit (MEN-233), UI de complemento
(gancho reservado, espera o complemento de produto), duplicar kit
(MEN-121), impressão (MEN-118), montador por IA (MEN-269), modo "a partir"
(MEN-159, cancelado).

#### Riscos

- `0003` convive com o checkout atual: `quantity` nullable quebra
  `reserve_stock` se a Fase 6 não acompanhar. Mitigação: o backfill mantém
  `quantity` preenchido nas linhas existentes e a Fase 6 entra antes de
  qualquer kit novo ir a produção.
- `mode` e `kind` coexistem até a migração de limpeza. O código novo lê
  `kind`; nada novo grava `mode`.

## Someday / maybe

## Shipped

_Move completed plans here so the top stays about the future._
