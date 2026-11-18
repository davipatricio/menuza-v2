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

### Suporte Mobile Expo SDK 58 — Storefront e Dashboard (MEN-313)

Dois apps nativos em Expo SDK 58 (`apps/mobile-storefront` e `apps/mobile-dashboard`), mantendo paridade de fluxo e visual com o web através do contrato OpenAPI comum (`crates/openapi/*.json`), regras de negócio centralizadas em `@menuza/shared`, e design tokens idênticos aplicados via `uniwind` (Tailwind v4 nativo).

#### Fase 1 — Extração de API e Regras Comuns (`packages/api-client`)

- [x] Criar workspace `packages/api-client` e liberar em `scripts/workspace-policy.test.ts`.
- [x] Configurar Orval para gerar cliente `fetch` TypeScript universal (compatível com Vite, Bun e Hermes/Expo).
- [x] Desvio deliberado: sem hooks gerados de TanStack Query; o cliente gera funções e cada tela usa `useQuery`/`useMutation`.
- [x] Centralizar o formatador BRL em `@menuza/shared/money`; carrinho não existe no web, então não há máquina de estados para compartilhar.
- [x] Refatorar `apps/web` para consumir `packages/api-client`.
      Verify: `bun run typecheck`, `bun test`, `apps/web` build verde. Feito.

#### Fase 2 — Fundação Expo SDK 58 e Monorepo

- [x] Adicionar `apps/mobile-storefront` e `apps/mobile-dashboard` ao Bun workspaces e `scripts/workspace-policy.test.ts`.
- [x] Configurar Expo SDK 58 (React Native 0.88, React 19.3, New Architecture).
- [x] Configurar `uniwind` com Tailwind v4 compartilhando os tokens semânticos de `apps/web/DESIGN.md`.
- [x] Configurar `@tanstack/react-query` persistido no SQLite local (`expo-sqlite`).
- [x] Configurar canal EAS Update com bsdiff de bytecode Hermes e `runtimeVersion` estático.
      Verify: `bun run typecheck` e `bun check` dos dois apps verdes.

#### Fase 3 — `apps/mobile-storefront` (Comprador Multi-tenant)

- [x] Resolução de tenant dinâmica via `applicationId` (build por loja grande), com seletor de slug persistido apenas em desenvolvimento.
- [x] Injeção de tema dinâmico (`applyStoreTheme`) lendo cores e raio de `PublicStore.theme`.
- [x] Telas nativas com `expo-router` v58:
  - Cardápio (`FlashList` com departamentos, categorias, subcategorias e kits).
  - Detalhe de produto com opções, nutrição, compartilhamento e háptica.
  - Composição de kit somente leitura, com faixas e grupos.
- [ ] Carrinho, frete por CEP e checkout Pix/cartão. Não existe no web e o `POST /commerce/orders` exige membro da loja com `orders:write`; um carrinho nativo seria um fluxo só do app, contra a paridade pedida.
- [ ] Live Activities e push de status. A assinatura push existe, mas nenhum produtor enfileira `push-notifications`; depende de backend.
      Verify: o cardápio, o produto e o kit refletem o catálogo publicado no banco.

#### Fase 4 — `apps/mobile-dashboard` (Lojista)

- [x] Autenticação com sessão de operador (`api-tenant`) e armazenamento seguro do cookie (`expo-secure-store`).
- [x] Abas nativas de pedidos (`NativeTabs`): Novos, Preparo, Prontos, Histórico.
- [x] Aba Gestão espelhando a sidebar web: visão geral, catálogo (produtos, kits, departamentos, categorias, subcategorias, tags, etiquetas), cupons, clientes, auditoria, integrações, configurações.
- [x] Leitura de todas as seções com `@menuza/api-client`; listas com estado de erro + retry (uma falha nunca vira "loja vazia").
- [x] Escrita de catálogo: produto criar/editar (variação única), kit editar identidade/preço, taxonomia criar/editar/excluir nas cinco seções.
- [x] Escrita de cupom: criar/editar, ativar/desativar, excluir; integração: ativar/desativar e listar sessões MCP.
- [x] Configurações: tema da loja (cores + raio) e SEO com escrita; senha; tema do app (sistema/claro/escuro); sessões ativas somente leitura.
- [x] Alarme e toque sonoro contínuo de novo pedido via `expo-audio`; notificação local (uma por código novo) e deep link `/order/<code>`.
- [x] Ação rápida de transição de estado do pedido, com motivo quando o servidor exige.
- [ ] Paridade restante de catálogo no app: variações múltiplas e estoque, nutrição, SEO por entidade, imagens, composição/grupos de kit. O mobile usa uma variação "Padrão" no create; com 2+ variações a edição de preço aponta para o web em vez de apagar o conjunto. (MEN-316)
- [ ] Paridade restante de cupom: seletor de produtos/kits (hoje ids crus), `usageLimit`/`stackable`/desconto de frete editáveis. (MEN-318)
- [x] Pausa emergencial? Não há campo de loja aberta/fechada no backend; widget de tela inicial exige código nativo por plataforma.
      Verify: a mudança de status feita no app é a mesma que o painel web lê, porque ambos usam `POST …/orders/{code}/transition`.

#### Fase 6 — Plataforma Expo (tema, gestos, notificações, mídia)

- [x] Tema claro/escuro do dashboard em `global.css` (`@layer theme` + `@variant`), espelhando `apps/web/src/styles/globals.css`; escolha sistema/claro/escuro em SQLite (`lib/theme-mode.tsx`), aplicada via `Uniwind.setTheme` (também ajusta `Appearance`). Storefront mantém as cores da loja.
- [x] `react-native-worklets@0.13` ligado ao Reanimated 4 (peer obrigatório).
- [x] `expo-notifications@58.1.9`: permissão, canal Android `orders` com vibração, handler, notificação local de pedido novo, toque abre o pedido. Push remoto continua fora do Expo Go no Android (SDK 53+) e depende do produtor River (MEN-317).
- [x] `expo-haptics`: seleção no toque de linha/card, sucesso/erro global por `MutationCache`, impacto médio em transição de pedido, aviso de pedido novo.
- [x] `android.predictiveBackGestureEnabled` nos dois apps; `Stack` com `slide_from_right`, `gestureEnabled`, `fullScreenGestureEnabled`; editores seguram back com `usePreventRemove` (`lib/navigation.ts`).
- [x] Animações curtas: 90 ms de escala no toque, stagger de 25 ms nos hubs, slide nativo; nada de spring em linha reciclada.
- [x] Cache: `expo-image` com `cachePolicy="memory-disk"` + transição de 120 ms no storefront; Query persistido em SQLite e limpo no login/logout do dashboard.
- [x] Controles nativos com `@expo/ui` 58.0.28 (camada universal, funciona no Expo Go): `SwitchRow` usa `Host` + `Switch`; o motivo de cancelamento abre em `BottomSheet`. Chips continuam próprios (multi-seleção densa); listas longas continuam em `FlashList`.
- [ ] Edge-to-edge explícito no Android (`android.edgeToEdgeEnabled` + `expo-navigation-bar`) e conferência em Android 15/16.
- [ ] App Links/Universal Links para `/order/<code>` e `/menu/<slug>` (hoje o deep link só funciona via notificação local).
- [ ] `expo-local-authentication` (biometria) para reabrir o dashboard; `expo-background-task` para polling em segundo plano (mínimo ~15 min); `expo-sharing`/`expo-file-system` para exportar clientes.
      Verify: `bun check` dos dois apps, bundle Metro 200, `expo-doctor` sem erro bloqueante.

#### Fase 5 — Matriz de Compilação de Lojas Grandes

- [x] Manifesto `stores.json` mapeando slug -> nome, ícone, splash e package name Android.
- [x] Configuração dinâmica no `app.config.ts` via env `STORE_SLUG`.
- [x] Automação de compilação EAS por loja compartilhando o mesmo `runtimeVersion` (`scripts/build-store-app.ts`, recusa slug com hífen e package fora de `app.menuza.store.*`).
- [x] Publicação de OTA único via `eas update` (`bun run store:update`).
      Verify: pendente de credenciais EAS; o script valida a loja e delega o build. Um AAB por loja e o mesmo update aplicado aos dois binários é a prova final.

## Someday / maybe

## Shipped

_Move completed plans here so the top stays about the future._
