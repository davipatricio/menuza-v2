# Mobile-dashboard UI/UX overhaul — plan

**Status: PLAN ONLY — do not build yet.**

## Context

The Expo dashboard app (`apps/mobile-dashboard`) works but its chrome is hand-rolled per screen: no shared header, no avatar, no drawer, no global search, three duplicated sign-out implementations, five near-identical taxonomy list screens, and several hardcoded colors that break dark mode. The web panel already has the target shape (`store-shell.tsx` sticky blurred header, `app-sidebar.tsx` nav groups, `GlobalSearch`), and the backend `searchPanel` endpoint is contracted and generated into `@menuza/api-client` — unused by any UI yet.

**User decisions (confirmed):**

1. **Drawer replaces the Mais tab** — bottom bar becomes 3 tabs (Início, Pedidos, Catálogo); drawer holds the full web nav groups + user footer; `gestao.tsx` deleted.
2. **Global search via `searchPanel`** — `GET /tenant/panel/stores/{slug}/search?q=` (`packages/api-client/src/tenant.ts:4673`); grouped results, deep links to existing screens.
3. **New Expo features: `expo-image` + `expo-blur`** — translucent blurred header, cached images. No gradient.

## Key facts

- `SessionMember` = `{ email, id, kind, name: string | null }` — avatar is **initials-only** (no photo field; `<expo-image>` slot reserved for later).
- `searchPanel` output `href`s are **web-shaped** (`/dashboard/{slug}/…`) — mobile must map `kind + id` to its own routes, never push server `href`.
- Drawer built as a **transparent Stack route**, not RNGH Drawer — `react-native-drawer-layout` would be a new package (excluded), and a Stack screen gets native gesture + predictive-back dismissal for free. Zero route re-parenting; deep links untouched.
- App rules to honor (`apps/mobile-dashboard/AGENTS.md`): queues stay segments inside Pedidos; no tab `index.tsx`; `ManagementList` for lists; `useUnsavedChangesGuard` on editors; semantic tokens only; pt-BR; verify = `bunx oxfmt` / `bunx oxlint` / `bun check`.
- New native deps require a **dev-client rebuild**; Expo Go already bundles expo-image/expo-blur so verification is unaffected.

## Phases

### Phase 0 — Deps + nav module

- Add `expo-image`, `expo-blur` (SDK 58) to catalog + `apps/mobile-dashboard/package.json`. Restart Metro after install (known symlink gotcha).
- New `src/lib/nav.ts`: `NAV_GROUPS` mirroring web `nav-config.ts` (Operação, Catálogo, Relacionamento, Sistema, Configurações) + `SEARCH_KIND_ROUTES` (kind+id → mobile route).

### Phase 1 — `AppHeader` + `UserMenu` (shared chrome)

- New `src/components/app-header.tsx`: h-14, `bg-background/80` over `BlurView`, drawer trigger / back chevron, store name, search button, avatar (32px initials circle). Screens pad content under it (sticky-blur parity with web).
- New `src/components/user-menu.tsx`: `@expo/ui` bottom sheet — identity, theme Sistema/Claro/Escuro (`useThemeMode`), Trocar de loja → `/stores`, **the one sign-out** (helper shared with `stores.tsx` and `settings/account.tsx`; duplicates deleted).
- Tab screens swap hand-rolled title rows for `<Page header={<AppHeader/>}>`; titles normalized to `text-xl font-semibold` (DESIGN.md parity).

### Phase 2 — Drawer route + 3-tab bar

- New `src/app/drawer.tsx`: Stack screen (`slide_from_left`, `transparentModal`), ~300dp, scrim = BlurView; store-switcher header, `NAV_GROUPS` as `ManagementRow` items with 25ms stagger, user footer → UserMenu.
- `(tabs)/_layout.tsx`: drop Mais trigger (keep Pedidos Badge); delete `gestao.tsx`; AppHeader hamburger → `/drawer`.
- Fallback if predictive back misbehaves: plain `presentation: "modal"` full-height sheet.

### Phase 3 — Global search

- New `src/app/search.tsx` (modal): autofocus input, 300ms debounce, min 2 chars (contract), TanStack Query `["panel-search", storeSlug, q]` + `keepPreviousData`, short `gcTime`; grouped results as `ManagementRow`s; kind→route deep links; order search stays client-side in the orders board (no order kind by design).

### Phase 4 — Expo features + motion polish

- `expo-image` in `catalog-browser.tsx`, product forms, order thumbs (`recyclingKey`, `transition={120}`, memory-disk cache).
- `expo-blur`: header (P1) + drawer scrim.
- New `src/lib/motion.ts` `useReducedMotion()` → `PressableScale` skips scale (keeps haptic), stagger delay 0. Motion stays ≤150ms.

### Phase 5 — Management chrome parity

- `management/_layout.tsx`: `headerShown: false`; every management screen uses `AppHeader` with back + `actions` (existing `HeaderAction` "Novo" slots). `usePreventRemove` guards unaffected (stack-level) — re-test each editor.

### Phase 6 — Cleanup

1. Collapse 5 taxonomy list screens → one `catalog/taxonomy/[kind].tsx` (per-kind table drives query/labels/editor link).
2. Hardcoded colors → tokens: `login-form.tsx:82,96` (`#6b655f`), `order/[code].tsx:227`, `form.tsx:73` (`#8a8478`), `form.tsx:274` (ActivityIndicator `#ffffff`), `settings/account.tsx:241` (`text-white`).
3. Delete local `Row`s in `order/[code].tsx`, `coupons/[id].tsx` → `ManagementRow` (+optional trailing slot).
4. Fold `ClearAction` into `HeaderAction` (add `variant`).
5. Loading: standardize on `Loading` + `ManagementList` pending state; remove "Carregando…" texts.
6. Remove unused deps `expo-constants`, `expo-linking`, `expo-system-ui` (keep `expo-symbols`!).

### Phase 7 — Accessibility

- `AccessibilityInfo.announceForAccessibility` on mutation success/error (`lib/feedback.ts`), new-order arrival, alarm start/silence.
- Chevrons `›`: `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`.
- `TextField`: label → TextInput `accessibilityLabel`.
- `maxFontSizeMultiplier={1.4}` on headers/rows/form labels.
- Drawer/search roles: `"link"` / `"search"`; TalkBack/VoiceOver pass.

### Phase 8 — Docs

- `apps/mobile-dashboard/AGENTS.md`: 3 tabs + `/drawer`, AppHeader replaces native management headers, search kind→route rule (never push web `href`), expo-image/blur + reduce-motion conventions. Update parent `AGENTS.md` / `docs/agents/mobile.md` where they claim four tabs.

## Parity phases (web → mobile capability gaps)

Audit traced every web mutation to its API client method; mobile calls the same generated client, so **no backend work needed** except where noted. Every new screen follows web DESIGN.md shape (h2 `text-xl font-semibold` + description, cards, `panel-labels`-style pt-BR, URL/state-driven filters) so new mobile screens read as the same product.

Order = capability-weighted, cheapest real wins first. AGENTS.md rule applies: a stub becomes a **full editor**, never a half-editor.

### P9 — Orders (small)

- **Record payment on delivery**: conditional action in `order/[code].tsx` when `financialStatus === "pending_on_delivery"` → `recordPanelOrderPayment` (unused client method; web `order-actions.tsx:81-105` parity) instead of bare transition.
- **`financialStatus` + `paymentMethod` filters** on the board: pass params to `listPanelOrders` (same call mobile makes today, params unused — `src/lib/orders.ts:13`); filter chips above the segments.

### P10 — Coupons (small-medium)

- `usageLimit`, `stackable`, `shippingDiscountPercent` controls in `coupon-form.tsx` (currently seeded-and-returned-untouched).
- **Product scope picker**: replace raw UUID text fields with a product `Combobox`-style picker over `listPanelProducts` (same pattern web `coupon-product-picker.tsx` uses; native = search modal reusing the P3 search UI shell).
- Bulk delete: `bulkDeletePanelCoupons` with long-press selection in `ManagementList`.

### P11 — Settings + integrations (small)

- **Session revoke**: per-session revoke + "revogar as demais" buttons on `settings/account.tsx` session list (`revokeAccountSession`, `revokeOtherAccountSessions` — importable, not imported).
- **Store SEO social image URL**: field + http(s) validation in `settings/store.tsx` (`savePanelStoreSeo` already called).
- **MCP session revoke**: button per session in `integrations.tsx` (`revokePanelMcpSession`).

### P12 — Product nutrition + SEO tabs (medium; full editors)

- Nutrition: basis, portionGrams, servingsPerPack, householdMeasure, labelFormat, source, notes, published → `savePanelProductNutrition` (unused).
- SEO: `getPanelSeo`/`savePanelSeo`/`revertPanelSeo`/`listPanelSeoEntities` (all unused) — full form mirroring web `seo-form.tsx` incl. jsonLd + links.
- Both as full `FormScreen` editors with `useUnsavedChangesGuard`.

### P13 — Kit create + composer (large — biggest true gap)

- Mobile cannot **create** a kit; edits identity only. Full parity needs: create (`createPanelKit`), groups (name/min/max/sort), items with product+variation picker (`listPanelKitOptions`, unused), per-item minQty/maxQty/quantity/step/allowSwap/chargeExtra, discount bands, couponStackable, maxKitsPerOrder, unavailableBehavior, imageUrl, reorder UX (chevron up/down — same convention as web's mobile-order buttons).
- Kit availability toggle via `updatePanelKit` (`setPanelKitAvailable` not in generated client).

### P14 — Product variations editor + bulk ops (large)

- Per-variation name/price/stockMode/stockQty editor with dupe-name validation (web `product-form.tsx` VariationRow parity); mobile currently writes price only for single-variation products.
- Bulk availability update + bulk delete with FlashList selection (`bulkUpdatePanelProducts`, `bulkDeletePanelProducts`).
- Server-side sort params on `listPanelProducts` (pass `sort`/`order`).

### P15 — Store signup/creation (large)

- Web-only today: register account, "Nova loja" (`createPanelStore`), reserved-slug validation, onboarding questionnaire (`savePanelOnboarding`), invite step. Multi-step stack on mobile; all client functions importable.

### Explicitly NOT gaps (skip)

- Customers (web is read-only too), team/roles (web read-only), store name/slug (no API exists), Entrega/Pagamentos (stubs on web too — full editor only when web ships one), product performance tab (mocked data on web), native push notifications (blocked on backend token shape — MEN-317), Komi assistant (web platform-specific).

## Verification

Per phase: `bunx oxfmt apps/mobile-dashboard && bunx oxlint apps/mobile-dashboard && cd apps/mobile-dashboard && bun check`.
Expo Go smoke (final): login → store picker → 3 tabs → drawer → every drawer destination → search → deep link → user menu → sign out; dark+light; reduced motion on; TalkBack/VoiceOver on drawer + forms + search.
Note: existing installed dev builds won't load expo-image/blur until rebuilt; Expo Go verification unaffected.

## Risks

- Predictive back vs transparent drawer modal (fallback ready).
- `headerShown:false` migration is the widest regression surface — re-test every editor's back-guard.
- Persisted query cache growth from search keys — capped by short `gcTime`.
- expo-blur on Android <12 degrades to translucent (acceptable).
