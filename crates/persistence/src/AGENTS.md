# crates/persistence/src — AGENTS.md

What is wrong or missing if you only read the crate root.

- `lib.rs` holds `MIGRATOR` only. Query modules are added here later, roughly one
  module per aggregate; `tenant.rs` is the scope types, not an aggregate.
- Query functions are named `<aggregate>_<verb>` (`coupon_find`, `coupon_insert`),
  and every tenant one takes `&TenantId` as its first parameter.
- Every tenant-scoped transaction comes from `begin_scoped`, which returns a
  `ScopedTx` carrying that tenant. Raw `begin` is only for unscoped scans that
  already hold a `Scope::Unscoped` with a reason; a tenant statement on a bare
  `Tx` is the bug `ScopedTx` exists to stop.
- Do not add a GUC, `SET LOCAL`, or an RLS policy in this folder until the RLS
  ADR lands (ADR-0001 keeps tenant scope app-layer). `begin_scoped` takes the id
  and deliberately does not set anything.
- `unscoped` needs a reason at the call site; a new reason is a new exception to
  justify in review, not a shortcut around a missing tenant id.
