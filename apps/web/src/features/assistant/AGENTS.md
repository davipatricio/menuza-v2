# features/assistant

Komi, the dashboard assistant. Mock only: canned pt-BR replies, no model call.

## Invariants

- Replies are local strings picked by keyword; there is no network call and no
  API key.
- The simulated latency is ~700ms and abortable; a new message cancels the
  previous timer.
- `InMemoryThreadListAdapter` and `KomiThreadListAdapter` seed a thread titled
  "Komi".
- Vendored `assistant-ui/elements/` differ from upstream on purpose: pt-BR
  strings, no attachment button, `justify-end` composer row, `outline-hidden!`
  with `focus-within:border-ring/60`, sheen sweep with `motion-reduce:hidden`.
  Do not "restore" upstream behaviour.
- Mounted once, after `</SidebarInset>`, launcher `fixed end-4 bottom-4 size-11`,
  panel 400px.

## Forbidden

Next.js imports, `@menuza/db`, `@prisma/*`, `@menuza/orpc-server`, any model SDK.

## Verify

`bunx oxfmt apps/web/src/features/assistant && bunx oxlint apps/web/src/features/assistant && bun run --filter '@menuza/web' build`
