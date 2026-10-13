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

- Contracts on the tenant surface; async delivery runs in `apps/worker` on BullMQ (Pix expiry, retries, notification fan-out).
- Email goes through the `Mailer` interface (SMTP now, SES stub later) — never send mail inline from a request handler (`../engineering/stack.md`).
- Push keys/subscriptions: `push.publicKey`, `push.preferences`, `push.subscriptions`; models `PushSubscription`, `PushPreference`. VAPID config is env-only.

## Checks

- A notification respects preferences, permissions and the recipient's tenant. → `../engineering/checks.md` scenario 11.
- A failed notification is retried and observable, and never blocks the order flow (`../orders/lifecycle.md`).
