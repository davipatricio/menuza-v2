# crates/domain/src — AGENTS.md

What is wrong or misleading one folder up.

- `password.rs` is argon2id hash/verify. `session.rs` is tokens, cookies and
  origin checks. `oauth.rs` is scopes, PKCE and the advertised origin.
  `money.rs` arrives later; keep the same one-module-per-rule shape.
- Every public function here is synchronous. No `async fn`, and no dependency
  that drags in `tokio`: check the feature list before adding one. A crate that
  starts a runtime by default belongs in an API crate, not this one.
- No `axum` type in a signature. A handler unpacks headers and passes
  `Option<&str>`; it never hands this folder an extractor or a response.
- Helpers stay private. A percent-decode or hex helper that leaks out becomes
  API, and this crate has to keep its surface small.
