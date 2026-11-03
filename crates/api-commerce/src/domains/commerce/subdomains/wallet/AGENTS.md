# wallet — AGENTS.md

Both routes here are tenant scoped and behind a store member with a capability:
`get_wallet` asks for `orders:read`, `adjust_wallet` for `wallet:adjust`. Unlike
the anonymous storefront reads, a missing tenant is `TENANT_NOT_RESOLVED` and
never an empty wallet.

The balance is a rollup. `Wallet.balanceCents` is the sum of the signed
`WalletTransaction` rows behind it, so every write inserts one entry and rolls
the stored balance forward in the same transaction. Never write a balance
without its entry, and never write an entry without moving the balance.

`adjust` opens a missing wallet instead of failing: a customer without a wallet
starts at zero, which is what a first store credit is. It locks the wallet row
before reading the balance, so two corrections cannot both act on the same
value.

A correction that would push the balance below zero is `CONFLICT`, not a 500.
The check happens before the write, but the `Wallet` CHECK is the real guard.

The `kind` for a manual correction is always `adjustment`, in both directions.
The DB CHECK on `WalletTransaction.kind` forbids `debit` and `credit`, so the
sign of `amountCents` is what carries direction.
