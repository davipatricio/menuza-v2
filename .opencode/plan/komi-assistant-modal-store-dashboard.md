# Add Komi, a mocked assistant-ui chat modal, to the store dashboard

Status: done
Updated: S7 [x] - done

## Non-goals

- No backend, API route, `fetch`, env var, AI SDK, or conversation persistence.
- No storefront / marketing / `/dashboard` picker / auth mount.
- No edits to `apps/web/src/components/ui/*`, `globals.css`, or `tw-animate-css`.
- No new tests; no `components.json` registry entry; no `docs/ui/component-catalog.md` update.
- No refactor of `StoreLayout`, `AppSidebar`, or `CrumbLabelsProvider`.

## Assumptions

- verified: the `styles/base-nova/assistant-modal.json` closure resolves to **21 unique files**; 20 are new, and `apps/web/src/hooks/use-copy-to-clipboard.ts` **already exists** with a compatible API (`{ isCopied, copyToClipboard }`, called as `useCopyToClipboard()` in `markdown-text.tsx`). Keep the local file; do not overwrite (registry signature is `{ copiedDuration }`).
- verified: no file in the closure imports `radix-ui` / `@radix-ui/*`. Only primitives used: `@base-ui/react/popover`, `@base-ui/react/collapsible`.
- verified: the popup already ships `w-100 max-w-[calc(100vw-2rem)]`, and `useModalSize` clamps to `window.innerWidth - 32` (min 320×400) → 343px at a 375px viewport, no overflow. **No width deviation needed.**
- verified: launcher is `fixed end-4 bottom-4 size-11` (bottom-right, RTL-safe); panel is portaled and `z-50` inside the vendored tree.
- verified: header title is `title || "New Chat"`; `InMemoryThreadListAdapter.generateTitle()` returns an empty stream (no auto title) but `rename()` persists one → seed `"Komi"` in `initialize`.
- verified: `useRemoteThreadListRuntime({ adapter, runtimeHook })`; `ChatModelAdapter.run` returns `Promise<ChatModelRunResult> | AsyncGenerator`; `ChatModelRunOptions` carries `abortSignal`; `ThreadSuggestion = { title?, label?, prompt }`.
- verified: `@base-ui/react@1.9.0` exposes `./popover` with `Root, Trigger, Portal, Positioner, Popup, Title` and the `positionMethod` prop; `./collapsible` exists.
- verified: local `ui/` exports every symbol the closure imports — `Button`, `Input`, `Skeleton`, `Textarea`, `Tooltip/TooltipContent/TooltipProvider/TooltipTrigger`, `Dialog/DialogTitle/DialogContent/DialogTrigger`, `Avatar/AvatarImage/AvatarFallback`.
- verified: `bun run design:check` scans `apps/web/src/app/(dashboard)` only; `apps/web/src/components/**` is out of its default scope.
- verified: `.oxlintrc.json` has **no** override for `components/assistant-ui/**`; it already lists `hooks/use-copy-to-clipboard.ts`.
- verified: `node_modules` is absent → `bun install` runs in S1.
- unverified: TypeScript 7 (`bun check`) accepts the vendored 48k-char `thread.aui.tsx` + `tool-fallback.aui.tsx` unchanged.
- verified: TS side of `.aui.tsx` is settled — `src/**/*.tsx` matches `assistant-modal.aui.tsx`, and Turbopack resolves the explicit `.aui` specifier.
- unverified: `oxlint` and `oxfmt` both act on `*.aui.tsx` (extension matching, not confirmed for the `.aui` infix). S2 and S4 each assert coverage with a temporary probe before trusting a green run.
- unverified: `oxfmt` reformatting of registry text is mechanical only (no semantic change).

## Code map

New (verbatim registry content, `apps/web/src/` + registry `path`):

```
components/assistant-ui/elements/assistant-modal.aui.tsx
components/assistant-ui/elements/thread.aui.tsx
components/assistant-ui/elements/thread-list.aui.tsx
components/assistant-ui/elements/tooltip-icon-button.tsx
components/assistant-ui/elements/attachment.aui.tsx
components/assistant-ui/elements/file.tsx
components/assistant-ui/elements/follow-up-suggestions.aui.tsx
components/assistant-ui/elements/image.tsx
components/assistant-ui/elements/markdown-text.tsx
components/assistant-ui/elements/reasoning.aui.tsx
components/assistant-ui/elements/reasoning.tsx
components/assistant-ui/elements/collapsible-root.tsx
components/assistant-ui/elements/tool-fallback.aui.tsx
components/assistant-ui/elements/tool-group.aui.tsx
components/assistant-ui/elements/media-player.tsx
components/assistant-ui/elements/surfaces.tsx
components/assistant-ui/utils/modal-size.ts
components/assistant-ui/utils/href.ts
components/assistant-ui/utils/useIsomorphicLayoutEffect.ts
hooks/use-attachment-src.ts
```

New first-party: `apps/web/src/components/assistant-ui/komi-assistant.tsx`
Edited: `apps/web/package.json`, `.oxlintrc.json`, `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx` (import + one element), plus the 3 string-only vendored edits in S4.

Existing symbols relied on: `StoreLayout` (layout.tsx:42), `SidebarProvider`/`SidebarInset`, `Button`, `Input`, `Skeleton`, `Textarea`, `Tooltip*`, `Dialog*`, `Avatar*`, `cn` (`@/lib/utils`).

## Steps

- [x] S1 Install deps and vendor the closure | files: `apps/web/package.json`; the 20 paths in Code map | owner: implementer | verify: `cd apps/web && bun run typecheck` and `bun -e "import{readdirSync,readFileSync}from'node:fs';const w=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(d+'/'+e.name):[d+'/'+e.name]);const h=w('apps/web/src/components/assistant-ui').filter(f=>/@?radix-ui/.test(readFileSync(f,'utf8')));console.log(h.length?h.join('\n'):'no radix imports');process.exit(h.length?1:0)"` (must print `no radix imports`, exit 0) | P1
      Add exact pins (repo style for framework deps): `@assistant-ui/react` `0.15.31`, `@assistant-ui/react-markdown` `0.14.24`, `remark-gfm` `4.0.1`, `tw-shimmer` `0.4.14`, `zustand` `5.0.16`. Then `bun install`. Write each file from its registry item's `files[].content` by script — base URL `https://r.assistant-ui.com/base/<item>.json`, items: `thread`, `thread-list`, `tooltip-icon-button`, `elements-modal-size`, `attachment`, `file`, `follow-up-suggestions`, `image`, `markdown-text`, `reasoning`, `tool-fallback`, `tool-group`, `use-attachment-src`, `elements-media-player`, `elements-href`, `use-copy-to-clipboard`, `elements-reasoning`, `elements-collapsible-root`, `elements-surfaces`. Do not fetch the bare-name shadcn deps (`button`, `skeleton`, `input`, `tooltip`, `dialog`, `avatar`, `textarea`) — they resolve to the existing `ui/` files. Skip `hooks/use-copy-to-clipboard.ts`. Finish with `bunx oxfmt apps/web/src/components/assistant-ui apps/web/src/hooks/use-attachment-src.ts`.
      **DONE 20/20 files + deps + install + oxfmt. Blocked on `@/lib/utils`:** 12 vendored files import `cn` from `@/lib/utils`, which does not exist; this tree imports `cn` from the `cn` npm package (`cn` 0.5.0, official shadcn clsx+tailwind-merge drop-in). Fix inside S1: create `apps/web/src/lib/utils.ts` containing exactly `export { cn } from "cn";` (satisfies the `utils` alias already declared in `apps/web/components.json`; vendored files stay verbatim). Then re-run the S1 verify.
- [x] S2 Exempt the vendored tree in **both** override blocks, then prove oxlint sees `.aui.tsx` | files: `.oxlintrc.json` | owner: implementer | verify: `bunx oxlint apps/web/src/components/assistant-ui apps/web/src/hooks/use-attachment-src.ts` (0 errors) **and** the probe below prints a diagnostic naming `assistant-modal.aui.tsx` | P1
      Add `"apps/web/src/components/assistant-ui/**"` and `"apps/web/src/hooks/use-attachment-src.ts"` to the `files` array of **both** existing vendored blocks — block 1 `.oxlintrc.json:143-169` (array starts line 146 with `apps/web/src/components/ui/**`) and block 2 `.oxlintrc.json:170-209` (array starts line 176 with `apps/web/src/components/reui/**`). `hooks/use-copy-to-clipboard.ts` already sits in both (lines 157, 188).
      Block 1 rules after the edit (unchanged, all `"off"`): `jsx-a11y/click-events-have-key-events`, `jsx-a11y/no-noninteractive-element-interactions`, `jsx-a11y/no-static-element-interactions`, `anti-slop/no-runtime-typeof`, `anti-slop/require-readable-spacing`, `anti-slop/require-safety-comment-for-type-assertion`.
      Block 2 rules after the edit (all `"off"`): `anti-slop/no-known-value-widening`, `anti-slop/no-unknown-parameters`, `anti-slop/no-unsafe-dictionary-type`, `anti-slop/no-chained-type-assertions`, `anti-slop/no-shape-in-symbol-names`, `anti-slop/no-object-parameters`, `anti-slop/no-unknown-returns`, `anti-slop/no-array-filter-map`, `anti-slop/no-conditional-empty-object-spread`, `anti-slop/no-reflect-get`, `react-hooks/exhaustive-deps`, `react/set-state-in-effect`, `react/refs`, `react/purity`, `react/immutability`, `react/preserve-manual-memoization`, `react/static-components`, **plus new `nextjs/no-img-element: "off"`** (for `<img>` in `image.tsx` + `attachment.aui.tsx`). No other rule changes; the `nextjs/no-img-element`-only block at `.oxlintrc.json:210-222` stays untouched.
      Coverage probe: append `debugger;` to `elements/assistant-modal.aui.tsx`, run `bunx oxlint --format=json apps/web/src/components/assistant-ui/elements/assistant-modal.aui.tsx`, confirm the JSON names that file with a `no-debugger` diagnostic, then remove the probe line and re-run the full S2 verify. Without this, oxlint may skip `.aui.tsx` silently and the green run is vacuous.
      **PROGRESS: both blocks patched (7 insertions); probe PASSED — `no-debugger` reported at `assistant-modal.aui.tsx:216`, `number_of_files: 1`, 211 rules. Residual 15 errors** (baseline 346 → 15) in rules the plan did not list: `jsx-a11y/heading-has-content` ×6, `jsx-a11y/no-autofocus` ×5, `jsx-a11y/media-has-caption` ×2, `jsx-a11y/anchor-has-content` ×1, `promise/no-callback-in-promise` ×1. All are upstream false positives (dynamic `{children}` that oxlint cannot see) or deliberate upstream behaviour (composer `autoFocus`, generated-media player, thread-list callback). Fix inside S2: add a **third** override block scoped only to `apps/web/src/components/assistant-ui/**` turning those five rules `"off"`, with a one-line comment naming each as an upstream false positive / intentional pattern. Do **not** widen block 2 (that would silently weaken `reui/`, `smoothui/`, `ui/*` which currently comply). Do not edit vendored source.
- [x] S3 Write the mock runtime wrapper | files: `apps/web/src/components/assistant-ui/komi-assistant.tsx` | owner: implementer | verify: `cd apps/web && bun run typecheck` | P2
      `"use client"`. Exports `KomiAssistant` only. Imports exactly:
      `import { AssistantModal } from "@/components/assistant-ui/elements/assistant-modal.aui";`
      `import { AssistantRuntimeProvider, useLocalRuntime, useRemoteThreadListRuntime, InMemoryThreadListAdapter } from "@assistant-ui/react";`
      `import type { ChatModelAdapter, ThreadSuggestion } from "@assistant-ui/react";`
      Internals:
      `KomiModelAdapter: ChatModelAdapter` → `run({ messages, abortSignal })`: take the last `user` message's text parts, `await` an abortable `sleep(700)` (`setTimeout` + `abortSignal` listener that clears it and rejects on abort), then return `{ content: [{ type: "text", text }] }`.
      `KOMI_REPLIES` pt-BR, keyword-routed (prices/catalog → "produto", "pedido" → orders, "cupom"/"promoção" → promotions, else round-robin) — store-operations voice, mention catálogo/pedidos/promoções/vitrine, no emoji, no growth-marketing tone.
      `KOMI_PROMPTS: ThreadSuggestion[]` — 3 pt-BR prompts (e.g. "Quais produtos estão sem estoque?", "Resuma os pedidos de hoje", "Sugira uma promoção para a vitrine").
      `class KomiThreadListAdapter extends InMemoryThreadListAdapter` overriding `initialize` to `await this.rename(remoteId, "Komi")` after `super.initialize` → seeds the header title. Construct **one module-level instance** (adapter identity must be stable).
      `useKomiRuntime()` → `useRemoteThreadListRuntime({ adapter: komiThreadList, runtimeHook: () => useLocalRuntime(KomiModelAdapter, { adapters: { suggestion: { generate: async () => KOMI_PROMPTS } } }) })`.
      `KomiAssistant` → `<AssistantRuntimeProvider runtime={runtime}><AssistantModal /></AssistantRuntimeProvider>`.
- [x] S4 pt-BR string patch (content only) + format | files: `.../elements/assistant-modal.aui.tsx`, `.../elements/thread.aui.tsx`, `.../elements/thread-list.aui.tsx` | owner: implementer | verify: `bunx oxfmt apps/web/src/components/assistant-ui/elements/assistant-modal.aui.tsx apps/web/src/components/assistant-ui/elements/thread.aui.tsx apps/web/src/components/assistant-ui/elements/thread-list.aui.tsx` then `bunx oxfmt --check apps/web/src/components/assistant-ui` (0 diffs) then `bunx oxlint apps/web/src/components/assistant-ui` (0 errors) then `cd apps/web && bun run typecheck` | P2
      Patch the literals, then **write** format on the three edited paths with `bunx oxfmt <3 paths>`, then confirm with `--check`.
      Coverage probe first (oxfmt may skip `.aui.tsx` silently): insert a stray extra blank line into `elements/assistant-modal.aui.tsx`, run `bunx oxfmt --check apps/web/src/components/assistant-ui`, confirm it prints that file and exits 1, then delete the line. A `--check` that passes without naming the file proves nothing.
      Replace **only** these literals (no class, structure, logic, or import changes):
      | file | from | to | |---|---|---|
      | assistant-modal | `open ? "Close Assistant" : "Open Assistant"` | `open ? "Fechar Komi" : "Abrir Komi"` |
      | assistant-modal | `"Threads" : title \|\| "New Chat"` | `"Conversas" : title \|\| "Komi"` |
      | assistant-modal | `tooltip="Threads"` | `tooltip="Conversas"` |
      | assistant-modal | `tooltip="New Thread"` | `tooltip="Nova conversa"` |
      | assistant-modal | `aria-label="Resize Assistant"` | `aria-label="Redimensionar Komi"` |
      | thread | `"How can I help you today?"` | `"Como posso ajudar com a sua loja?"` |
      | thread | `placeholder="Send a message..."` | `placeholder="Pergunte sobre produtos, pedidos ou promoções…"` |
      | thread | `aria-label="Message input"` | `aria-label="Mensagem para a Komi"` |
      | thread | `tooltip="Send message"` / `aria-label="Send message"` | `"Enviar mensagem"` |
      | thread | `aria-label="Assistant is working"` | `aria-label="Komi está respondendo"` |
      | thread | `"Loading earlier messages"` / `"Load earlier messages"` | `"Carregando mensagens anteriores"` / `"Carregar mensagens anteriores"` |
      | thread | `tooltip="Copy"` / `tooltip="Scroll to bottom"` / `tooltip="Edit"` | `"Copiar"` / `"Ir para o fim"` / `"Editar"` |
      | thread | `"Cancel"` / `"Update"` | `"Cancelar"` / `"Atualizar"` |
      | thread-list | `"Search threads"` (both aria-label + placeholder) | `"Buscar conversas"` |
      | thread-list | `aria-label="Rename thread"` / `aria-label="Loading threads"` | `"Renomear conversa"` / `"Carregando conversas"` |
      Leave unreachable tooltips (voice, feedback, branch prev/next, export) untouched — no adapter enables them.
- [x] S4b Finish pt-BR in the conversation list and thread a11y copy | files: `.../elements/thread-list.aui.tsx`, `.../elements/thread.aui.tsx` | owner: implementer | verify: `bunx oxfmt --check apps/web/src/components/assistant-ui` then `bunx oxlint apps/web/src/components/assistant-ui` then `cd apps/web && bun run typecheck` | P2
      S4 left reachable English behind: the Conversas panel shows `Today`/`Yesterday`/`Earlier` (l.117-119), `No threads found` (l.212), `New Thread` (l.269), `Running` (l.337 sr-only), `More options` (l.421), `Rename` (l.437), `Archive` (l.445), `Delete` (l.454); the thread shows `Loading conversation` (l.154), `You said`/`Assistant said` (l.303 sr-only), `Assistant is speaking` (l.311), `Resume generating` (l.551/557), `Refresh` (l.738), `More` (l.744). Replace with pt-BR (`Hoje`/`Ontem`/`Anteriores`, `Nenhuma conversa encontrada`, `Nova conversa`, `Em execução`, `Mais opções`, `Renomear`, `Arquivar`, `Excluir`, `Carregando conversa`, `Você disse`/`Komi disse`, `Komi está falando`, `Continuar gerando`, `Gerar novamente`, `Mais`). Leave voice/feedback/branch/export literals untouched - no adapter enables them. Content-only, no class or logic changes.
- [x] S5 Mount it in the store shell | files: `apps/web/src/app/(dashboard)/dashboard/[storeSlug]/layout.tsx` | owner: implementer | verify: `bun run design:check` then `cd apps/web && bun run typecheck` | P3
      Add `import { KomiAssistant } from "@/components/assistant-ui/komi-assistant.tsx";` and render `<KomiAssistant />` as the last child of `<SidebarProvider>` (after `</SidebarInset>`). Two lines total; no other edit to the file.
- [x] S6 Manual smoke | owner: verifier | verify: `bun run infra:up` then `bun run db:deploy` then `bun --env-file-if-exists=.env run --filter '@menuza/db' db:seed` then `bun run dev`, open `http://127.0.0.1:3000/dashboard/login` (checklist below) | P4
      Precondition (no session exists without it): `packages/db/prisma/seed.ts` upserts member `marina@menuza.local` / password `menuza-demo` (`owner` on `mawifoods`, `admin` on `nova-loja`). `dev` alone leaves you logged out. Sign in on `/dashboard/login` (E-mail / Senha / Entrar), then open `/dashboard/mawifoods`.
      Checklist: launcher bottom-right; opens/closes with keyboard (Tab + Enter/Esc); header reads "Komi"; typed message appears and gets a canned pt-BR reply ~700ms later; "Conversas" view lists threads; new-thread button starts fresh; drag the top-left handle resizes and survives reload (localStorage `aui-modal-size`); no horizontal scrollbar at 375px and 1280px.
- [x] S7 Final gate | owner: verifier | verify: `bun run typecheck && bun test && bun run lint && bun run fmt:check && bun run build` | P5
      `bun run fmt:check` / `bun run lint` are repo-wide; a pre-existing failure in the five catalog table files is known (see `apps/web/AGENTS.md`) — report, do not fix.

## Parallel

- P1: S1, S2
- P2: S3, S4
- P3: S5
- P4: S6
- P5: S7

## Decisions & deviations

- **D1 — flavor:** `styles/base-nova` only. Verified zero `radix-ui` imports across all 21 files. The `new-york` element would import `radix-ui` and is rejected by `src/components/AGENTS.md`.
- **D2 — width clamp: no deviation.** The premise that the panel is a fixed 400px is outdated: upstream already carries `w-100 max-w-[calc(100vw-2rem)]` plus a JS clamp (`innerWidth - 32`, min 320). Vendor as-shipped; nothing to change. If a narrower guard is ever wanted, `max-w-[min(calc(100vw-2rem),25rem)]` is the one-token edit.
- **D3 — pt-BR copy overrides "zero string edits".** S4's table is the only content change; structure, classes, imports and behavior stay upstream. Without it the widget ships English ("New Chat", "Open Assistant") and fails the pt-BR house rule and the "Abrir Komi" requirement. Rejected alternative: accept English internals.
- **D4 — no `tw-animate-css`.** Vendored `animate-in` / `fade-in-0` / `zoom-in-95` / `slide-in-from-*` / `shimmer` classes stay inert, matching the documented known gap in `src/components/AGENTS.md`. The panel still opens/closes (Base UI mount), just without an enter animation. No `globals.css` edit.
- **D5 — `tw-shimmer` installs but is inert.** Four registry items use the `shimmer` class, which only exists after `@import "tw-shimmer"` in `globals.css` — banned here. Kept because the registry declares it; delete the dep + the future import in one line if dead weight matters more.
- **D6 — `hooks/use-copy-to-clipboard.ts` is NOT overwritten.** The local file already serves the vendored `markdown-text.tsx` call shape. Overwriting would churn a tracked file for no behavior gain.
- **D7 — `.oxlintrc.json` override is required, not cosmetic.** Vendored trees are exempted by precedent (`reui/`, `smoothui/`, `ui/{magicui,…}`); `assistant-ui/` is a new vendored tree under the same policy — so it joins **both** vendored blocks (shape rules + `nextjs/no-img-element`), as specified in S2.
- **D8 — no `components.json` registry entry.** Files are fetched by script, not `shadcn add`; adding a namespace would imply a `shadcn add` workflow we do not use.
- **D9 — `z-50` / `dark:shadow-*` / custom `shadow-[…]` live inside the vendored popup.** Sanctioned by "vendored trees keep upstream behaviour"; `design:check` never scans them. The mounted dashboard file carries none of these.
- **D10 — deferred, not planned:** real provider, conversation persistence, store context injection, `@assistant-ui` in the catalog.
- **D11 — `apps/web/src/lib/utils.ts` is created (one line).** The registry tree imports `cn` from the `@/lib/utils` alias declared in `components.json`, but this repo never created that file — it imports `cn` from the `cn` npm package directly. Creating `export { cn } from "cn";` satisfies the declared alias without touching the 12 vendored files and without changing any existing call site.
- **D12 — a third oxlint block scoped to `assistant-ui/**` only.** The leftover 15 findings are all rules the other vendored blocks leave on, and all are either upstream false positives (oxlint can't see dynamic `{children}` in `markdown-text.tsx` headings/anchors) or deliberate upstream behaviour (`autoFocus` in the composer, generated-media `<video>` without tracks, a promise callback in `thread-list`). Turning them off in block 2 would silently weaken `reui/`, `smoothui/` and `ui/{magicui,aceternity,cult-ui,motion-primitives}` which currently comply, so they go in their own block. Vendored source stays byte-identical to the registry.

## Risks / Not doing

- **TypeScript 7 on vendored 0.15 code** (unverified). If `bun check` rejects a vendored file, report the exact diagnostic as a blocker — do not edit vendored logic and do not touch tsconfig.
- **Base UI drift:** the element targets `@base-ui/react` ~1.9; verified `positionMethod`, `Title`, `onOpenChange(open, eventDetails)` all exist in 1.9.0. A prop mismatch is a blocker, not a `ui/` edit.
- **`AssistantRuntimeProvider` import path:** `@assistant-ui/react` `package.json#exports` is `["."]` only — there is **no** `@assistant-ui/react/context` subpath. Root import `import { AssistantRuntimeProvider } from "@assistant-ui/react"` is the only form and already works (re-exported via `export * from "./context/index.js"`).
- **Path alias style:** vendored files import without `.tsx`; `allowImportingTsExtensions` + bundler resolution accept both. Do not "normalize" to match repo style — that would be a 20-file diff.
- **Bundle size:** `@assistant-ui/react` + markdown + `remark-gfm` land in the dashboard client graph (~200KB+ pre-gzip). Accepted; the modal is always mounted, not lazy. A `next/dynamic` split is the next step if the dashboard's First Load JS budget matters.
- **Animations** are absent by design (D4); a reviewer may read that as broken. Called out in the PR body.
- **Mock latency** uses a timer; background-tab throttling makes replies slower than 700ms. Expected.
