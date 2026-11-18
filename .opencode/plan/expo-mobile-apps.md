# Expo SDK 58: suporte mobile universal (storefront multi-tenant + dashboard) (MEN-313)

Status: proposed
Updated: S0

## Decisões fechadas

- Dois apps nativos distintos em vez de um só:
  - `apps/mobile-storefront`: comprador, multi-tenant dinâmico, matriz de compilação por loja grande (`STORE_SLUG`).
  - `apps/mobile-dashboard`: lojista, binário único global para operação em tempo real (pedidos, KDS, estoque rápido).
- Stack alinhada a novembro de 2026: Expo SDK 58, React Native 0.88, React 19.3.x, New Architecture obrigatória, Hermes v1 ativo.
- Navegação nativa via `expo-router` v58:
  - Usar `Stack` e `NativeTabs` estáveis.
  - Não usar `ExperimentalStack` nem `SplitView` (APIs alpha com restrições severas de headers, modais e Android).
  - Não usar data loaders do Expo Router no app nativo (forçam servidor intermediário e travam splash screen em 3G).
- Estilização universal com `uniwind` (Tailwind CSS v4 compilado para estilos nativos):
  - Compartilhar variáveis e tokens de `apps/web/DESIGN.md` (`--primary`, `--accent`, `--radius`, `--muted`).
  - Não compartilhar arquivos `.tsx` de layout web diretamente: o web usa Base UI + React DOM (`div`), mobile usa React Native (`View`, `Text`, `FlashList`).
- Fonte de dados compartilhada:
  - Extrair Orval de `apps/web` para `packages/api-client` (liberado em `scripts/workspace-policy.test.ts`).
  - OpenAPI gerado pelo Rust (`crates/openapi/{commerce,tenant}.json`) é a única fonte da verdade dos contratos.
  - Orval gera cliente `fetch` puro e hooks de `@tanstack/react-query` consumidos tanto por web quanto por mobile.
- Lógica de domínio em `@menuza/shared`:
  - Cálculos de valores monetários sempre em centavos inteiros (`formatBrl`, `formatBrlInput`).
  - Validações de cupom, transições de status de pedido e carrinho são funções puras reaproveitadas.
- Atualização OTA e publicação (Play Store):
  - Um único canal EAS Update (`storefront`) com diff de bytecode Hermes (`enableBsdiffPatchSupport: true`).
  - `runtimeVersion` estático gerenciado manualmente (`storefront-v1`) para permitir que todas as lojas recebam o mesmo update JS.
  - Manifest dinâmico `app.config.ts` lê `stores.json` + env `STORE_SLUG` para injetar `android.package`, nome, ícone e splash de cada loja.
  - O slug da loja em runtime é lido nativamente via `Application.applicationId` (`expo-application`), nunca embutido no bundle JS.

## Non-goals

- Um repositório ou pasta por loja (todas as lojas compartilham `apps/mobile-storefront`).
- Reescrever UI em Rust (GPUI, Dioxus ou Tauri).
- Embrulhar telas web em WebView / Capacitor / `'use dom'` para checkout ou cardápio.
- App de dashboard separado por loja (o dashboard é uma aplicação única para todos os operadores).
- Publicação imediata de dezenas de lojas pequenas (o modelo de AAB individual é voltado exclusivamente para lojas grandes parceiras).
- Modificar o schema de banco ou endpoints existentes sem antes passar pelo contrato OpenAPI do Rust.

## Assumptions

- verified: `crates/openapi/commerce.json` e `crates/openapi/tenant.json` são atualizados por `cargo run -p openapi`.
- verified: `apps/web` roda em React 19.3.1 e TanStack Query 5.104.4.
- verified: `scripts/workspace-policy.test.ts` possui uma allowlist explícita (`ALLOWED_WORKSPACES`). Novos workspaces exigem entrada e teste passando.
- verified: `TenantScope` e isolamento do backend são fail-closed; a identificação de tenant é validada na camada de rede/servidor.
- verified: Expo SDK 58 suporta React 19.3 e New Architecture sem modo legado.
- verified: Uniwind 1.13 suporta Tailwind v4 nativamente no React Native.

## Code map

- `crates/openapi/{commerce,tenant}.json` — schemas OpenAPI gerados pelo Rust.
- `apps/web/orval.config.ts` — configuração atual do Orval no frontend web (a ser migrada).
- `packages/shared/src/` — tipos e helpers de domínio compartilhados.
- `packages/api-client/` — novo workspace para clientes HTTP e hooks TanStack Query.
- `apps/mobile-storefront/` — novo workspace Expo para a vitrine do comprador.
- `apps/mobile-dashboard/` — novo workspace Expo para gestão de pedidos e balcão.
- `scripts/workspace-policy.test.ts` — validação de integridade e allowlist de workspaces.
- `package.json` — catalog e workspaces Bun da raiz.

---

## Fases de Execução

### Fase 1 — Extração do Cliente OpenAPI (`packages/api-client`)

Isola a comunicação com os backends Rust em um pacote do monorepo, compartilhando contratos e hooks entre web e mobile.

- Criar `packages/api-client/package.json` dependendo de `@tanstack/react-query`, `valibot` e `workspace:*`.
- Adicionar `packages/api-client` à allowlist de `scripts/workspace-policy.test.ts`.
- Mover configuração do Orval de `apps/web/orval.config.ts` para `packages/api-client/orval.config.ts`.
- Configurar Orval para gerar cliente `fetch` agnóstico e hooks TanStack Query (`commerce` e `tenant`).
- Refatorar `apps/web` para importar chamadas e tipos de `@menuza/api-client`.
- Mover utilitários puros de carrinho e formatação de centavos para `@menuza/shared`.

Verify:

```bash
bun test scripts/workspace-policy.test.ts
bun run --filter '@menuza/web' build
bun run typecheck
```

### Fase 2 — Fundação Expo SDK 58 e Monorepo Setup

Configura a infraestrutura mobile no monorepo Bun com as ferramentas recomendadas para o fim de 2026.

- Registrar `apps/mobile-storefront` e `apps/mobile-dashboard` no `package.json` raiz e em `scripts/workspace-policy.test.ts`.
- Inicializar `apps/mobile-storefront` com Expo SDK 58, React Native 0.88, React 19.3 e TypeScript 7.
- Configurar `metro.config.js` com suporte a monorepo Bun e plugin do `uniwind`.
- Criar `global.css` com Tailwind v4, mapeando as variáveis semânticas de `apps/web/DESIGN.md` (`--color-background`, `--color-primary`, `--radius`, etc.).
- Configurar persistência do TanStack Query com `@tanstack/query-persist-client-core` sobre `expo-sqlite`.
- Configurar `expo-updates` com `fallbackToCacheTimeout: 0` e `enableBsdiffPatchSupport: true`.

Verify:

```bash
bun test scripts/workspace-policy.test.ts
bun run typecheck
bun run --filter '@menuza/mobile-storefront' check
```

### Fase 3 — `apps/mobile-storefront` (App do Comprador)

Constrói a experiência de compra com paridade funcional ao `_storefront` do web.

- **Resolução de Loja:**
  - Em desenvolvimento / preview: seleção manual de tenant, deep link ou QR code.
  - Em produção (loja grande): extração do slug a partir de `Application.applicationId` (`app.menuza.store.<slug>`).
  - Buscar dados iniciais via `GET /commerce/storefront`.
- **Tema Dinâmico:**
  - Injetar cores da loja e raio de borda no contexto Uniwind através de um `StoreThemeProvider`.
- **Navegação & Telas (`expo-router`):**
  - `/menu`: navegação de departamentos e categorias com `FlashList` (rolagem suave com centenas de itens).
  - `/product/[id]`: bottom sheet nativo com seleção de variações e complementos.
  - `/cart`: resumo do pedido com validação de centavos idêntica ao web.
  - `/checkout`: cálculo de frete, aplicação de cupom, seleção de pagamento (Pix Copia-e-Cola com `expo-clipboard`, cartão ou pagamento na entrega).
- **Recursos Nativos:**
  - Live Activity no iOS via `expo-widgets` para acompanhamento do pedido na Lock Screen e Dynamic Island.
  - Push notifications para atualizações de status via FCM / APNs.

Verify:

- Fluxo de ponta a ponta: produto adicionado ao carrinho -> pedido criado na API `crates/api-commerce` com valores em centavos corretos.

### Fase 4 — `apps/mobile-dashboard` (App do Lojista)

App operacional para donos e funcionários de lojas gerenciarem pedidos e balcão.

- Inicializar estrutura base com Expo SDK 58 e `expo-router`.
- Autenticação de operador com sessão de `crates/api-tenant`, guardando credencial em `expo-secure-store`.
- Abas de controle de pedidos (`NativeTabs`):
  - Pendentes (com alerta sonoro contínuo via `expo-audio`).
  - Em Preparo.
  - Prontos / Despachados.
  - Histórico.
- Ações rápidas de transição de estado (`ACCEPTED`, `PREPARING`, `DISPATCHED`, `CANCELLED`).
- Painel de emergência: abrir/fechar loja temporariamente e pausa rápida de produtos esgotados.
- Widget de tela inicial (Android e iOS via `expo-widgets`) com contagem de pedidos em aberto.

Verify:

- Transição de estado acionada no app mobile reflete instantaneamente no banco e no painel web.

### Fase 5 — Automação da Matriz de Lojas Grandes e EAS

Configura a pipeline para empacotar binários Android personalizados mantendo um OTA único.

- Criar `apps/mobile-storefront/stores.json` mapeando metadados de cada loja parceira:
  ```json
  {
    "pizzaria-ze": {
      "name": "Pizzaria do Zé",
      "package": "app.menuza.store.pizzariaze",
      "icon": "./assets/stores/pizzaria-ze/icon.png",
      "splash": "./assets/stores/pizzaria-ze/splash.png"
    }
  }
  ```
- Configurar `app.config.ts` para resolver dinamicamente o pacote, nome e splash a partir de `process.env.STORE_SLUG`.
- Fixar `runtimeVersion: "storefront-v1"` em todas as compilações para unificar o canal de updates.
- Criar script de automação `scripts/build-store-app.ts` para disparar builds EAS parametrizadas.
- Configurar fluxo de CI para deploy de OTA:
  ```bash
  eas update --channel storefront --message "Atualização da vitrine"
  ```

Verify:

- Gerar AABs para duas lojas distintas; confirmar que ambas conectam à API correspondente e consomem o mesmo canal de atualização OTA.

---

## Verificação Final

Ao término de todas as fases, executar na raiz:

1. `bun test scripts/workspace-policy.test.ts`
2. `bun run typecheck`
3. `cargo test --workspace`
4. `bun test`
5. `cargo clippy --workspace --all-targets -- -D warnings`
6. `cargo fmt --all --check`
7. `cargo run -p openapi -- --check`
8. `bun run lint`
9. `bun run fmt:check`
10. `bun run build`
