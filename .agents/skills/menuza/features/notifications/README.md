# Notifications

`PRODUCT.md` §17. Tickets: MEN-100 notificacoes, MEN-101/147 email, MEN-197 web-push, MEN-153 (post-MVP WhatsApp).

How Menuza tells the store, its team and the buyer that something happened. Channels: **panel, email, PWA push**.

## Rules

- The store and each user configure which events they get and on which channel, including team preferences.
- **Preferences never grant access** to data beyond the recipient's permissions, and never widen the tenant boundary. A recipient outside the tenant gets nothing.
- Initial events: new order, payment confirmed, Pix expired, order ready, cancellation, integration failure.
- Push depends on device/browser permission and can **never be the only record** of an operational event — the panel and email remain the record. WhatsApp automation is out of the MVP.
- Open: recipients per event, default preferences, and the transactional-vs-marketing split (`../product/open-decisions.md`). Marketing needs a legal basis before it ships (`../customers/README.md`).

## Code entry points

- Contracts in `crates/contract`; panel push routes in `crates/api-tenant` (:3002) under `crates/api-tenant/src/domains/tenant/subdomains/push/` (`getPushPublicKey`, `getPushPreferences`, `updatePushPreferences`, `subscribePush`, `unsubscribePush`).
- Async delivery runs in `crates/worker` on River/Postgres (ADR-0008): `push_dispatch.rs` fans out, `push_sender.rs` sends (VAPID ES256 + aes128gcm). `push-notifications` has no producer yet; `payment-events` has none either.
- Email has no sender in the repo yet; a request handler still never sends mail inline (`../engineering/stack.md`).
- Push tables `PushSubscription` / `PushPreference` in `crates/persistence/migrations/0001_baseline.sql`. VAPID config is env-only.

## Checks

- A notification respects preferences, permissions and the recipient's tenant. → `../engineering/checks.md` scenario 11.
- A failed notification is retried and observable, and never blocks the order flow (`../orders/lifecycle.md`).
