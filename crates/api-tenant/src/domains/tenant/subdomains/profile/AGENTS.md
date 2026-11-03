# profile — AGENTS.md

One route: `POST /profile/onboarding`, and it is an upsert. The survey is unique
on `memberId`, so a member who reopens the screen edits the existing row instead
of creating a second one, and an unanswered optional is stored as NULL rather
than skipped.

It is member-level like `account`: no `storeSlug`, no tenant scope, no
capability. The session cookie names the member, the origin check guards the
write, and the handler returns the answer it just stored.

The onboarding enums live in `contract::tenant::session`, not here — the same
`Onboarding` shape is embedded in `/session/current`, and a copy in this
subdomain would drift. Mapping a slug back to the enum is the handler's job;
an out-of-contract value already stored reads as unanswered, never as an error.

Do not add a read route. The answers come back on `/session/current`, and a
second reader would be a second shape to keep in sync.

Do not let this module grow into a general profile editor. Name, e-mail and
avatar are owned elsewhere; a write here that touches the member row would
bypass the paths that exist for those, and `profile` would stop being one
upsert.
