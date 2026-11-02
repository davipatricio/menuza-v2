# features/orders

Order board (fulfilment columns, URL-driven filters) and order detail.

## Layout

- `server/orders.functions.ts` — `listOrdersFn`, `loadOrderFn` (order + its
  transitions in one round trip).
- `components/orders-board.tsx` — board island; filters write to the URL with
  `navigate({ href, resetScroll: false })`.
- `components/order-actions.tsx` — transition buttons plus the reason dialog
  (`transitionOrder`, `recordOrderPayment`).

## Invariants

- Filters live in the URL (`financialStatus`, `paymentMethod`), parsed in the
  route loader from `loaderDeps`; a hand-edited value falls back to no filter.
- A transition that requires a reason opens the dialog; the API rejects the call
  without one.
- Error copy maps oRPC codes to pt-BR (`ORDER_TRANSITION_INVALID`,
  `REASON_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`).
- Status labels and badge tones come from `@/lib/panel-labels.ts` only.

## Forbidden

Next.js imports, `@menuza/db`, `@prisma/*`, `@menuza/orpc-server`.

## Verify

`bunx oxfmt apps/web/src/features/orders && bunx oxlint apps/web/src/features/orders && bun run --filter '@menuza/web' build`
