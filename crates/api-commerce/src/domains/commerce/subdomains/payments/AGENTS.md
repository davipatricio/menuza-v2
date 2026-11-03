# payments — AGENTS.md

This module has one route: `POST /payments/gateway-events/{gatewayEventId}/apply`.
It is internal, proved by `InternalToken` and `TenantScope`, with no session and
no member. The webhook receiver persists the provider event and the worker calls
this route to act on it.

Nothing here talks to Pagar.me. The provider client is not a dependency of this
crate; the gateway event is already stored, and applying it is a database
decision. If you find yourself wanting to fetch or verify a payload, the change
belongs in the receiver.

Replay is idempotent. The event row is locked for the transaction; an event that
is already terminal is answered from its status and never replayed, and a
replayed `paid` refuses to credit cashback twice through the shared
`orders::mark_paid` path.

A missing event is an outcome, not an error: `GatewayError::NotFound` becomes
`GatewayEventOutcome::Missing`, so the worker stops retrying instead of treating
a lost event as a broken route. Only a genuine refusal keeps its catalog code.
A broken database is still a 500.
