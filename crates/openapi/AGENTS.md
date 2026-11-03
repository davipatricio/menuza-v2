# crates/openapi — AGENTS.md

The emit binary: `cargo run -p openapi` serializes `api_commerce::openapi()` to
`commerce.json` and `api_tenant::openapi()` to `tenant.json`, both beside this
file. The paths come from `CARGO_MANIFEST_DIR`, so the working directory does not
matter.

Both JSON files are generated. Never hand-edit them: the next run overwrites the
edit, and a hand-patched schema is a promise the code cannot keep.

## The gate

`cargo run -p openapi -- --check` regenerates both documents in memory and
compares them with the committed files as parsed JSON, so whitespace and key
order are not drift. Any difference prints the file name to stderr and exits
`1`; a clean run prints `openapi up to date` and exits `0`; an unknown argument
exits `2`. CI depends on those codes — do not change them casually.

Run the check after any change to a route, a schema or an operation id.

## Generated client

The TanStack client is generated from these two files by orval. A changed path,
a changed `operation_id` or a changed schema is a frontend-breaking change, not a
refactor: regenerate the client in the same change and expect every caller to
move with it.
