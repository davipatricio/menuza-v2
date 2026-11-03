# orders — AGENTS.md

An order carries two independent state machines, financial and fulfilment, in
two columns. `transition` moves exactly one axis at a time; the legal
`(axis, from, to)` tuples, the capability each one requires and whether it
demands a reason all live in `crates/persistence/src/commerce/orders.rs`. Do not
re-derive the rules here — this module only maps `OrderError` onto the catalog,
so an illegal move is `CONFLICT`, not a 500.

`POST /orders/{code}/expire` is not a member route. It proves `InternalToken`
instead of `CommerceSession`, because the worker calls it when a payment window
closes. It is idempotent by code: a second run on an already-expired order
touches nothing.

`recordPayment` credits cashback exactly once. It locks the order row, and the
`cashback_credited` event is the receipt that the credit already happened, so a
retried member action and a replayed gateway callback both land here without
crediting the wallet twice.

Creation prices the cart, takes stock and reserves the wallet inside one tenant
transaction. The money is decided only there; the handler passes the input
through and maps the refusal.
