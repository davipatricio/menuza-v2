# crates/http/src — AGENTS.md

What the crate root does not make obvious is which file owns which piece.

- `config.rs` — env-only configuration, read once at boot. It is the only place
  a key is read; handlers receive `Config`, never `std::env`.
- `layers.rs` — the stack and its documented order. A new layer belongs here,
  never in a binary.
- `extract.rs` — extractors only. A new extractor goes here and must not trust
  a client-supplied identity header; provenance is proved from the peer, the
  config and the secret.
- `docs.rs` — the development-only Scalar mount. Production gets the router
  back untouched.
- `lib.rs` — `AppState`, `init_tracing`, `connect`, `router`, `serve`.

`extract.rs` returns rejection types, not layers, and holds its own tests next
to the pure helpers.
