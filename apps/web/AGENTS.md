# apps/web

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Next.js 16.4 (stable), App Router, Server Components by default.
- TypeScript v7 only — `experimental.useTypeScriptCli: true` is set in `next.config.ts` and verified against `next@16.4.2`.
- Build type checking is enabled (`typescript.ignoreBuildErrors: false`).
- Host-aware routing in `src/proxy.ts`. Two modes:
  - `main` → marketing (pages at `/`, `/about`, `/pricing`, `/contact`) and dashboard
    (`/dashboard/[storeSlug]`). `WEB_MAIN_DOMAIN` is authoritative: it is the only
    main-domain host, plus `localhost`/`127.0.0.1`/`[::1]` outside production. Any other
    host is denied with 404 (fail-closed, reversed in MEN-225; see ADR-0005's
    amendment). Unknown paths still return 404.
  - `storefront` → buyer-facing store on a tenant host
    (`/store`, `/menu`, `/cart`, `/checkout`)
    The proxy resolves `host → tenantId` through the tenant API's internal
    `resolveHost` procedure (never the `Domain` table directly) for storefront
    hosts only and injects `x-menuza-tenant-id`; a storefront host with no
    `Domain` row returns 404. The main domain never resolves a tenant. The
    `/store/[storeSlug]` path alias on the main domain lands in MEN-225.
    See ADR-0005.
- Document language: `pt-BR`. User-facing content stays in Portuguese.
- UI components use `@base-ui/react` (NOT Radix). Tailwind v4 via `@import "tailwindcss"` in `src/app/globals.css` and `@tailwindcss/postcss` in `postcss.config.mjs`. shadcn (Base UI variant) provides `button`, `card`, `input`, `label`, `dialog`, `table`, `sidebar`, `badge`, `tabs`, `breadcrumb`, `dropdown-menu`, `checkbox`, `avatar`, `select`, `combobox`, `collapsible`, `popover`, `calendar`, `field` (plus `accordion`, `button-group`, `carousel`, `context-menu`, `input-group`, `radio-group`, `scroll-area`, `separator`, `sheet`, `skeleton`, `slider`, `switch`, `textarea`, `tooltip`, `use-mobile`) in `src/components/ui/`.
- Dashboard visual system: `DESIGN.md` (tokens, recipes, motion, responsive, wording, slop bans) is authoritative for `/dashboard`. New pages follow its Iteration Guide, then run `bun run design:check` from the repo root before `typecheck`/`lint`.
- Component-layer rules (primitive inventory, vendored folders, overlay policy, known gaps) live in `src/components/AGENTS.md`. `components.json` registers seven shadcn namespaces (`@reui`, `@smoothui`, `@magicui`, `@motion-primitives`, `@cult-ui`, `@aceternity`, `@ecomcn`); what each one actually gives you and which blocks fit each surface is in `docs/ui/component-catalog.md`.

## Dashboard UI conventions

- Every dashboard date field uses `DatePicker` from
  `src/app/(dashboard)/dashboard/signup/_components/date-picker.tsx` (Popover +
  `calendar`). Pass `minDate`/`maxDate` explicitly: `captionLayout="dropdown"` falls
  back to the last 100 years without them. `<input type="date">` is banned.
- A `Checkbox` outside `src/components/ui/**` is labeled with
  `Field orientation="horizontal"` + `Checkbox id={field.name}` +
  `FieldLabel htmlFor={field.name}`. A wrapping `<label>` trips
  `jsx-a11y/label-has-associated-control`, because Base UI renders a `<button>` and
  the rule does not count a button as a labelable control.
- `Button render={<Link … />}` carries its `aria-label` on the `Link`, not on the
  `Button`: `jsx-a11y/control-has-associated-label` reads the rendered element, and
  the visible text must be contained in the label (WCAG 2.5.3).
- Route skeletons: form/settings routes ship `loading.tsx` with `SimpleLoading`;
  table routes use `TableLoading`.
- `useForm` + a contract schema: writing optional fields as bare `undefined` in
  `defaultValues` narrows the inferred form type to `undefined`, so the schema stops
  being assignable to `validators`. Widen the schema once into a typed const
  (`const couponSchema: any = CreateCouponInputSchema;`, reason in the comment) instead
  of casting each `validators` entry — every `as` needs its own `SAFETY:` comment
  (`anti-slop/require-safety-comment-for-type-assertion`).

## Komi assistant (dashboard)

- Komi is the dashboard's AI assistant and it is **mock-only**: canned replies from an
  in-memory adapter. No backend, no network call, no env var.
- Mounted once, in `src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx`, as the last
  child of `<SidebarProvider>` (after `</SidebarInset>`), so it covers every
  `/dashboard/[storeSlug]/*` page. It is not on `/dashboard` (the store picker), login,
  signup, the storefront or marketing.
- Launcher: a floating button bottom-right (`fixed end-4 bottom-4 size-11`) that opens a
  400px-wide resizable chat panel portalled above the shell — thread list ("Conversas"),
  composer, message actions, three suggestion chips.
- First-party code is a single file: `src/components/assistant-ui/komi-assistant.tsx` (the
  runtime wrapper). The rest of `src/components/assistant-ui/elements/` and
  `src/hooks/use-attachment-src.ts` are vendored registry files, changed only by the
  deltas below.
- Vendored from `https://r.assistant-ui.com/styles/base-nova/assistant-modal.json` and
  its `registryDependencies` under `https://r.assistant-ui.com/base/<item>.json`. **Base
  UI flavor only**: the `new-york` flavor of the same element imports `radix-ui`, which
  this repo bans — never swap it in.
- `src/lib/utils.ts` exists only because the vendored tree imports `cn` from the
  `@/lib/utils` alias in `components.json`; it is one line (`export { cn } from "cn";`).
  The five new deps are local to `apps/web/package.json` (single consumer, not catalog):
  `@assistant-ui/react` 0.15.31, `@assistant-ui/react-markdown` 0.14.24, `remark-gfm`
  4.0.1, `tw-shimmer` 0.4.14, `zustand` 5.0.16.
- `AssistantRuntimeProvider` + `useRemoteThreadListRuntime` over
  `InMemoryThreadListAdapter`; `KomiModelAdapter: ChatModelAdapter` returns canned pt-BR
  replies after a ~700ms abortable delay, keyword-routed (catálogo/produtos/estoque,
  pedidos, cupom/promoção/desconto, vitrine/loja, else round-robin).
- A `KomiThreadListAdapter` subclass seeds the thread title "Komi" in `initialize`. All
  state is in memory, so a reload resets the conversation.
- Deliberate deltas from upstream — **preserve these when re-vendoring**: pt-BR strings in
  `assistant-modal.aui.tsx`, `thread.aui.tsx`, `thread-list.aui.tsx`; the duplicated
  `sr-only` label on `AssistantModalButton` removed (the a11y tree read "Abrir Komi Abrir
  Komi"); `<ComposerAddAttachment />` not rendered (no attachment adapter, so it is a
  dead control) with the composer action row moved `justify-between` → `justify-end`;
  both composers' textareas use `outline-hidden!` and their shells
  `focus-within:border-ring/60`, because the unlayered global `:focus-visible` rule in
  `globals.css` beat the old `outline-none` and drew an orange ring inside the bubble;
  `AssistantModalButton` has a hover/focus sheen sweep on the otherwise unused
  `--btn-sheen` token and `--duration-move`, transform-only, `motion-reduce:hidden`.
- No adapter is mounted for attachments, voice/dictation, feedback (helpful/not helpful),
  branch navigation or export. Those controls stay hidden, not translated-and-dead.
- `.oxlintrc.json` lists `assistant-ui/**` and `hooks/use-attachment-src.ts` in both
  vendored override blocks, plus a third block scoped to `assistant-ui/**` that turns off
  five upstream-flagged rules (`jsx-a11y/anchor-has-content`,
  `jsx-a11y/heading-has-content`, `jsx-a11y/media-has-caption`, `jsx-a11y/no-autofocus`,
  `promise/no-callback-in-promise`) — upstream false positives oxlint cannot see through
  dynamic `{children}`, or deliberate upstream behaviour.
- `bun run design:check` scans `src/app/(dashboard)` only, not `src/components/**`, so the
  vendored tree sits outside that gate and has to be kept honest by hand.
- The vendored animation classes (`animate-in`, `fade-in-0`, `zoom-in-95`) are inert:
  `tw-animate-css` is not a dependency. A known repo-wide gap — do not fix it for Komi
  alone.
- `.aui.tsx` files are ordinary `.tsx` to the toolchain — matched by the `tsconfig`
  `src/**/*.tsx` glob and linted/formatted by oxlint and oxfmt like anything else, so the
  override block above is the only thing keeping upstream's a11y patterns quiet. A green
  lint run is not evidence that a file was skipped.

## Lint and format

- Format only what you touched: `bunx oxfmt <paths>`. Never a package-wide
  `bun run fmt` — it rewrites files outside the change.
- `anti-slop/require-readable-spacing` is autofixable: `bunx oxlint --fix <paths>`,
  then re-run the formatter and lint again; formatting must not reintroduce findings.
- `bunx oxfmt` is clean repo-wide; `bunx oxlint .` still reports pre-existing errors in
  five untouched table files under `src/app/(dashboard)/dashboard/[storeSlug]/catalog/`
  (`categories`, `departments`, `kits`, `products`, `tags`). Judge a change by
  `bunx oxfmt <paths>` + `bunx oxlint <paths>`, not by the repo-wide exit code.
- Dashboard auth: `/dashboard/login` and the `/dashboard/signup/*` wizard (conta →
  perfil → escolha → loja|convite) call same-origin `/tenant/rpc` through
  `src/lib/session-client.ts`. Forms use `@tanstack/react-form` with the shared Valibot
  schemas; the birthdate field is a Base UI `popover` + `calendar` (`react-day-picker`).
- Dashboard data: every page under `/dashboard/[storeSlug]` is a Server Component
  that reads through `panelClient()` in `src/lib/server-tenant.ts`, which forwards
  the request's `menuza_tenant_sid` cookie to the tenant API. Tables and tab
  switches are client islands (`*-table.tsx` / `*-tabs.tsx`) that receive rows as
  props — no data fetch in the browser. The shell resolves `panel.getStore` on
  every request (`export const instant = false`, no `generateStaticParams`), so an
  unknown slug and a non-member are both 404 and a freshly created store opens
  empty rather than 404ing. `src/lib/panel-labels.ts` is the only place the
  contract's ASCII enums become pt-BR, and `formatBrl` takes cents (ADR-0006).
- Catalog products surface:
  - List search/filters are URL state parsed **server-side** by
    `catalog/products/product-search-params.ts` (`nuqs` parsers + `createLoader`).
    `products-table.tsx` writes the same keys with `useQueryStates` (shallow,
    debounced text) and resets `page`; filtering/ordering is a pure function in
    `product-filter.ts` over the one `panel.listProducts` payload. Deterministic
    order is `sortOrder` asc → name → id (`sortOrder` is part of
    `PanelProductSchema`).
  - "Exportar CSV" is a server route (`catalog/products/export/route.ts`) that
    reuses the same parser/filter and the session client: `text/csv`, UTF-8 BOM,
    `private, no-store`, attachment named after the store slug.
  - The editor's Produto/SEO tabs are Base UI `keepMounted` panels, so unsaved
    input survives tab switches; `?tab=seo` is shallow URL state (no server hit).
    `product-form.tsx` and `_components/seo-form.tsx` diff against the initial
    snapshot and send **partial** payloads: omitted = untouched, `null` =
    clear/inherit, empty diff = no request. `MoneyInput` formats digits as cents
    on every keystroke (not only on blur).
  - **Money inputs reuse `MoneyInput`.** Any new price/cost/freight field copies
    the live-formatting pattern from `product-form.tsx` (integer cents in form
    state, `formatBrlInput` + digit-only `onChange` in the input); never a raw
    `type="number"` or a blur-only formatter.
  - Product search matches name, description, SEO title/description, variation
    names, category, department and tags (`product-filter.ts`); the list payload
    carries those fields so filtering stays server-side and request-free.
- `settings/account` (password change + active sessions with revocation) and
  `settings/team` (read-only member/role list) are live, both added by MEN-225.
  The `account.*` procedures are **member-level** — they take no `storeSlug` —
  yet the page lives under the store shell's settings, because the sidebar is
  store-scoped. The shell is the navigation, not the authorization.
  - The session list shows row **digests**, never bearer tokens; the current row
    is flagged so the UI hides its own revoke button (a crafted request may still
    self-revoke, which is just logout).
  - `changePassword` revokes every _other_ session, so the page says so up front —
    a member whose other devices sign out should read it as intended, not a bug.
  - `settings/team` renders `FORBIDDEN` as the read-only notice, because
    `listTeamMembers` is gated on `team:read` and a `staff` role is refused.
  - `formatDateTime` (in `src/lib/format.ts`) is the one ISO→pt-BR date
    conversion, same edge-conversion role as `formatBrl`.
- Theme toggle (`next-themes`) lives in the storefront header and the dashboard sidebar footer; root layout provides `ThemeProvider` with `attribute="class"`.
- PWA shell: `withSerwist` in `next.config.ts`, service worker served at `/serwist/sw.js`, `SerwistProvider` in root layout, manifest file at `public/manifest.webmanifest` served (and referenced in `layout.tsx` metadata) as `/manifest.webmanifest`.
  - **Offline support**: SW handles `sync` event tagged `menuqueue-replay` and posts `menuqueue-drain` to open tabs. The page-side `OfflineListener` calls `drainQueue()` from `src/offline` and `invalidateQueries()` on conflict.
- TanStack Query shell: `QueryProvider` in root layout wraps `PersistQueryClientProvider` with the IndexedDB persister from `src/offline`. No queries yet.
- Browser clients hit same-origin `/commerce/...` and `/tenant/...` (rewritten to loopback APIs by `next.config.ts`).
- Build artifact: `output: "standalone"` emits `.next/standalone/apps/web/server.js`; runs on Bun in `Containerfile`; images build via `bun run scripts/docker-build.ts web`.
- Server clients use `COMMERCE_INTERNAL_URL` / `TENANT_INTERNAL_URL` and a per-request client. No shared cookies/tenant context across requests.
- NEVER import `@menuza/db`, Prisma, or `@menuza/orpc-server` from client or shared code.
- `apps/web` never reads the database directly and does not depend on `@menuza/db`. Every data operation goes through the internal API servers (`@menuza/commerce` or `@menuza/tenant`) using user session tokens or the shared `INTERNAL_API_SECRET` internal-communication token (sent as `x-menuza-internal-token`). The target origin is `COMMERCE_INTERNAL_URL` / `TENANT_INTERNAL_URL` (localhost or an external URL); never bypass the APIs with direct DB calls.
- Tenant host resolution is `tenant.internal.resolveHost` called server-side from `src/proxy.ts` with the shared internal token; the proxy no longer touches `Domain` itself.
- No secrets in `NEXT_PUBLIC_*` variables.
- Sentry: `instrumentation-client.ts` (browser), `instrumentation.ts` + `sentry.server.config.ts`/`sentry.edge.config.ts` (server/edge), `global-error.tsx` (root boundary). `next.config.ts` is wrapped by `withSentryConfig`; source map upload and release creation run only when `SENTRY_AUTH_TOKEN` is set. Browser DSN is `NEXT_PUBLIC_SENTRY_DSN` (public by design). Tracing samples 10% by default (`*_TRACES_SAMPLE_RATE=0.1`); set `0` to rely on OpenTelemetry tracing only. LGPD scrubbing is shared via `@menuza/shared/sentry-privacy`. The Sentry tunnel route is intentionally off: `src/proxy.ts` does not exempt `/monitoring`.

## Next.js 16.4 adoption

- Versions: `next@16.4.2` (stable, dropped the canary pin) and `react`/`react-dom`
  `19.3.1` (View Transitions, Fragment Refs, `browser()`). `cacheComponents` and
  `partialPrefetching` were already enabled; 16.4 keeps them as the recommended model.
- `ensureStatic` guards the routes that must stay static:
  - `src/app/(marketing)/layout.tsx` → `ensureStatic = "navigation"`: the marketing
    pages (`/`, `/about`, `/pricing`, `/contact`) are fully static, so a later dynamic
    addition fails the build instead of silently becoming request-time.
  - `src/app/(storefront)/store/layout.tsx` → `ensureStatic = "shell"`: the storefront
    nav and Suspense fallbacks stay static while `CommerceStatusCard` streams per request.
  - The dashboard shell intentionally stays dynamic (`instant = false`, session read per
    request), so it sets no `ensureStatic`.
- `navigation()` / `prefetch()` (`next/cache`) are available but unused: the only
  request-time content (`CommerceStatusCard`) is an uncached fetch already deferred by its
  `<Suspense>` boundary, so no extra stage boundary is needed.
- Not adopted: `reactCompiler` + `turbopackRustReactCompiler` (experimental; rewrites
  memoization across the client tree) and `turbopackAdditionalRoots` (for symlinked deps
  outside the project root / a global virtual store — this repo uses Bun workspaces).
- Per-route stage decisions and audits: use the `menuza` skill, `engineering/route-stages.md`.

## Compatibility flags

- `experimental.useTypeScriptCli: true` — required because TS 7 does not expose the legacy compiler API. Documented by Next (https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/typescript/runTypeScriptCli.ts). Removal condition: when Next ships a non-CLI type-check path that supports TS 7 without this flag.
- `typedRoutes` is OFF: `next.config.ts` sets `typedRoutes: false` and that file is authoritative.
  Links are typed as plain `string` routes.
- `cacheComponents: true` — required for the app's static shells and Partial Prefetching.
- `partialPrefetching: true` — required; prefetches static route parts by default.
- `experimental.agentUpgrade: "latest"` — upgrade reminders on `next dev`/`next build`.
- `experimental.agentFeedback: true` — `next dev` maintains a managed feedback block in
  this file; requires telemetry and is a no-op in CI.
- `experimental.turbopackGc: true` — reclaims unused compile work in long dev sessions.
- `experimental.turbopackLazyDynamicImports: true` — compiles client dynamic imports on demand.
- `experimental.turbopackPluginRuntimeStrategy: "workerThreads"` — runs plugin tools
  in-process; Next falls back to `childProcesses` on Node.js affected by nodejs/node#65100.
- No `ignoreBuildErrors: true`. Type errors must be fixed, not suppressed.

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
