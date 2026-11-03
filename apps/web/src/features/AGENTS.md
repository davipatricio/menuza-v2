# src/features

Domain code. One folder per product area; routes stay thin and import from here.

## Folders

| Folder          | What it owns                                                     |
| --------------- | ---------------------------------------------------------------- |
| `assistant/`    | Komi chat components (mock replies only).                        |
| `audit/`        | Store audit trail (read-only).                                   |
| `auth/`         | Login, signup, session helpers.                                  |
| `catalog/`      | Products, kits, taxonomy, CSV export.                            |
| `coupons/`      | Coupon list, form, detail, redemptions.                          |
| `customers/`    | Customer list and detail.                                        |
| `integrations/` | Integration catalog, detail, MCP sessions.                       |
| `marketing/`    | Static marketing chrome.                                         |
| `orders/`       | Order board and detail.                                          |
| `settings/`     | Store, delivery, payments, notifications, team, account.         |
| `shell/`        | Dashboard chrome: sidebar, nav config, overview, query provider. |
| `storefront/`   | Buyer-facing surfaces (`_storefront`).                           |

## Shape inside a feature

- `server/*.functions.ts` — `createServerFn` reads/writes. This is the only place
  that talks to the APIs.
- `components/` — route pieces and client islands. An island calls the
  `createServerFn` functions from `server/*.functions.ts` through a TanStack
  Query mutation and calls `void router.invalidate()` after a write. Browser code
  never builds its own API client: `server/*.functions.ts` reach the Rust APIs
  through `panelClient()` (`@/server/panel-client.ts`) against `/tenant/...`
  REST. The only browser-side exceptions are `@/lib/session-client.ts` and
  `@/lib/push-client.ts`, which call `/tenant/...` same-origin.
- `lib/` — pure helpers, no React, no server imports.
- `schemas/` — valibot schemas shared by forms and server functions.

## Rules

- No `@/server/**` import outside `server/*.functions.ts`; `.oxlintrc.json`
  blocks it. Wrap the read in a server function instead.
- No Next.js imports, no `"use client"`.
- List screens render the shared `DataTable` with a type-only `ColumnDef`
  import from `@tanstack/react-table`; never a hand-rolled table.
- Import with explicit `.ts` / `.tsx` suffixes.
- pt-BR copy, semantic color tokens, `gap-*` spacing.
- Every type assertion needs a `// SAFETY:` comment.

## Verify

`bunx oxfmt apps/web/src/features/<domain> && bunx oxlint apps/web/src/features/<domain> && bun run --filter '@menuza/web' build`
