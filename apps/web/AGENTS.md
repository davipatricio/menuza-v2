# apps/web

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Next.js 16.x (canary), App Router, Server Components by default.
- TypeScript v7 only — `experimental.useTypeScriptCli: true` is set in `next.config.ts` and verified against `next@16.4.0-canary.19`.
- Build type checking is enabled (`typescript.ignoreBuildErrors: false`).
- Host-aware routing in `src/proxy.ts`. Two modes:
  - `main` → marketing (pages at `/`, `/about`, `/pricing`, `/contact`) and dashboard
    (`/dashboard/[storeSlug]`). `WEB_MAIN_DOMAIN` is authoritative: it is the only
    main-domain host, plus `localhost`/`127.0.0.1`/`[::1]` outside production. Any other
    host is denied with 404 (fail-closed, reversed in MEN-225; see ADR-0005's
    amendment). Unknown paths still return 404.
  - `storefront` → buyer-facing store on a tenant host
    (`/store`, `/menu`, `/cart`, `/checkout`)
    The proxy resolves `host → tenantId` from the `Domain` table for storefront
    hosts only and injects `x-menuza-tenant-id`; a storefront host with no `Domain`
    row returns 404. The main domain never resolves a tenant. The
    `/store/[storeSlug]` path alias on the main domain lands in MEN-225.
    See ADR-0005.
- Document language: `pt-BR`. User-facing content stays in Portuguese.
- UI components use `@base-ui/react` (NOT Radix). Tailwind v4 via `@import "tailwindcss"` in `src/app/globals.css` and `@tailwindcss/postcss` in `postcss.config.mjs`. shadcn (Base UI variant) provides `button`, `card`, `input`, `label`, `dialog`, `table`, `sidebar`, `badge`, `tabs`, `breadcrumb`, `dropdown-menu`, `checkbox`, `avatar`, `select`, `combobox`, `collapsible` (plus transitive `sheet`, `separator`, `skeleton`, `tooltip`, `textarea`, `input-group`, `use-mobile`) in `src/components/ui/`.
- Theme toggle (`next-themes`) lives in the storefront header and the dashboard sidebar footer; root layout provides `ThemeProvider` with `attribute="class"`.
- PWA shell: `withSerwist` in `next.config.ts`, service worker served at `/serwist/sw.js`, `SerwistProvider` in root layout, manifest at `/public/manifest.webmanifest`.
  - **Offline support**: SW handles `sync` event tagged `menuqueue-replay` and posts `menuqueue-drain` to open tabs. The page-side `OfflineListener` calls `drainQueue()` from `@menuza/offline` and `invalidateQueries()` on conflict.
- TanStack Query shell: `QueryProvider` in root layout wraps `PersistQueryClientProvider` with the IndexedDB persister from `@menuza/offline`. No queries yet.
- Browser clients hit same-origin `/commerce/...` and `/tenant/...` (rewritten to loopback APIs by `next.config.ts`).
- Build artifact: `output: "standalone"` emits `.next/standalone/apps/web/server.js`; runs on Bun in `Containerfile`; images build via `bun run scripts/docker-build.ts web`.
- Server clients use `COMMERCE_INTERNAL_URL` / `TENANT_INTERNAL_URL` and a per-request client. No shared cookies/tenant context across requests.
- NEVER import `@menuza/db`, Prisma, or `@menuza/orpc-server` from client or shared code. (`src/proxy.ts` is the one server-only exception: it reads `Domain` for tenant resolution.)
- No secrets in `NEXT_PUBLIC_*` variables.
- Sentry: `instrumentation-client.ts` (browser), `instrumentation.ts` + `sentry.server.config.ts`/`sentry.edge.config.ts` (server/edge), `global-error.tsx` (root boundary). `next.config.ts` is wrapped by `withSentryConfig`; source map upload and release creation run only when `SENTRY_AUTH_TOKEN` is set. Browser DSN is `NEXT_PUBLIC_SENTRY_DSN` (public by design). Tracing samples 10% by default (`*_TRACES_SAMPLE_RATE=0.1`); set `0` to rely on OpenTelemetry tracing only. LGPD scrubbing is shared via `@menuza/shared/sentry-privacy`. The Sentry tunnel route is intentionally off: `src/proxy.ts` does not exempt `/monitoring`.

## Compatibility flags

- `experimental.useTypeScriptCli: true` — required because TS 7 does not expose the legacy compiler API. Documented by Next (https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/typescript/runTypeScriptCli.ts). Removal condition: when Next ships a non-CLI type-check path that supports TS 7 without this flag.
- `typedRoutes: false` — typed routes are off; `next.config.ts` is authoritative
  (it says `false`).
- `cacheComponents: true` — required for the app's static shells and Partial Prefetching.
- `partialPrefetching: true` — required; prefetches static route parts by default.
- No `ignoreBuildErrors: true`. Type errors must be fixed, not suppressed.
