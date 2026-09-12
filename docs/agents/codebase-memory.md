# Codebase memory (codebase-memory-mcp)

The repo is indexed in codebase-memory-mcp (project `C-Users-davip-Documents-Projetos-menuza`, root `C:\Users\davip\Documents\Projetos\menuza`). Background watcher auto-refreshes on git changes. Prefer graph tools for structural discovery; fall back to grep/glob for string literals, config values, and non-code files.

## Indexing

- Automatic: watcher + `auto_index` keep it fresh; no manual step needed in normal sessions.
- Manual re-index (CLI, one-shot): `& "$env:LOCALAPPDATA\Programs\codebase-memory-mcp\codebase-memory-mcp.exe" cli index_repository --repo-path . --progress`
- Status: `cli index_status --project C-Users-davip-Documents-Projetos-menuza` / MCP `index_status`. Check `parse_partial` and `skipped` before trusting negative claims.
- Excluded by design: `.git`, `node_modules`, `.next`, `.turbo`, `dist`, `packages/db/prisma/generated`, vendored oxlint plugins.

## Searching (MCP via Code Mode: `tools["codebase-memory"].*`)

- `search_graph` — find symbols by pattern, e.g. `name_pattern: ".*Handler.*"`.
- `trace_path` — callers (`direction: "inbound"`) or callees (`"outbound"`) of a function.
- `get_code_snippet` — exact source of a symbol by `qualified_name`.
- `get_architecture` — orientation: entry points, routes, hotspots, layers.
- `query_graph` — Cypher, e.g. `MATCH (f:Function)-[:CALLS]->(g) WHERE f.name='buildRpcFetch' RETURN g.name`.
- `detect_changes` — map uncommitted diff to affected symbols with risk.
- `check_index_coverage` — required before negative/exhaustive claims; read flagged ranges directly.
