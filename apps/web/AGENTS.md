# apps/web

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Next.js 16.x (canary), App Router, Server Components by default.
- TypeScript v7 only — `experimental.useTypeScriptCli: true` is set in `next.config.ts` and verified against `next@16.4.0-canary.19`.
- Build type checking is enabled (`typescript.ignoreBuildErrors: false`).
- Host-aware routing in `src/proxy.ts`. Three modes:
  - `landing` → marketing (pages at `/`, `/about`, `/pricing`, `/contact`)
  - `storefront` → buyer-facing store (`/store`, `/menu`, `/cart`, `/checkout`)
  - `management` → store admin (`/manage`, `/admin`)
    Unknown hosts return 403; cross-mode path access returns 404. The proxy also
    resolves `host → tenantId` from the `Domain` table and injects
    `x-menuza-tenant-id`; a storefront/management host with no `Domain` row returns 404.
- Document language: `pt-BR`. User-facing content stays in Portuguese.
- UI components use `@base-ui/react` (NOT Radix). Tailwind v4 via `@import "tailwindcss"` in `src/app/globals.css` and `@tailwindcss/postcss` in `postcss.config.mjs`. shadcn (Base UI variant) provides `button`, `card`, `input`, `label`, `dialog` in `src/components/ui/`.
- Theme toggle (`next-themes`) lives in both shell headers; root layout provides `ThemeProvider` with `attribute="class"`.
- PWA shell: `withSerwist` in `next.config.ts`, service worker served at `/serwist/sw.js`, `SerwistProvider` in root layout, manifest at `/public/manifest.webmanifest`.
  - **Offline support**: SW handles `sync` event tagged `menuqueue-replay` and posts `menuqueue-drain` to open tabs. The page-side `OfflineListener` calls `drainQueue()` from `@menuza/offline` and `invalidateQueries()` on conflict.
- TanStack Query shell: `QueryProvider` in root layout wraps `PersistQueryClientProvider` with the IndexedDB persister from `@menuza/offline`. No queries yet.
- Browser clients hit same-origin `/commerce/...` and `/tenant/...` (rewritten to loopback APIs by `next.config.ts`).
- Build artifact: `output: "standalone"` emits `.next/standalone/apps/web/server.js`; runs on Bun in `Containerfile`; images build via `bun run scripts/docker-build.ts web`.
- Server clients use `COMMERCE_INTERNAL_URL` / `TENANT_INTERNAL_URL` and a per-request client. No shared cookies/tenant context across requests.
- NEVER import `@menuza/db`, Prisma, or `@menuza/orpc-server` from client or shared code. (`src/proxy.ts` is the one server-only exception: it reads `Domain` for tenant resolution.)
- No secrets in `NEXT_PUBLIC_*` variables.

## Compatibility flags

- `experimental.useTypeScriptCli: true` — required because TS 7 does not expose the legacy compiler API. Documented by Next (https://github.com/vercel/next.js/blob/canary/packages/next/src/lib/typescript/runTypeScriptCli.ts). Removal condition: when Next ships a non-CLI type-check path that supports TS 7 without this flag.
- `typedRoutes` is OFF until verified working with the selected canary + TS7.
- `cacheComponents` is OFF until host/request dynamic usage is confirmed compatible.
- No `ignoreBuildErrors: true`. Type errors must be fixed, not suppressed.
