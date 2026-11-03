# push — AGENTS.md

Five routes over two resources: `GET`/`PUT /push/preferences` and
`POST`/`DELETE /push/subscriptions`, plus the anonymous `GET /push/public-key`.

Push is tenant-scoped even though it looks like a member's device list. The
proxy writes `x-menuza-tenant-id` from the request host, the cookie proves the
member, and `membership_role` proves the two belong together. A member without a
membership on that tenant is `FORBIDDEN`, exactly like the auth middleware this
replaced. `support::require_push_member` is that chain; every non-public handler
starts there.

`GET /push/public-key` takes no credential on purpose: the service worker needs
it before a session exists. An unset key is `INTERNAL`, never an empty string,
so a misconfigured deploy fails loudly instead of subscribing nothing.

A subscription is globally unique per endpoint. A row belonging to another
tenant or member answers `FORBIDDEN` and is never overwritten — a shared browser
must not let one account take over another account's push channel.

Preferences are per tenant and member, not per member. Do not add a route that
reads or writes them without the tenant, and do not move the public key behind
the session.
