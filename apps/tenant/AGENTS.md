# apps/tenant

- Owns the Bun.serve process for the tenant (management) API.
- The router implementation lives in `@menuza/api-tenant`; this app
  imports it and wires it into `Bun.serve`.
- Loopback-bound in development. Reachable in production only via internal rewrite from `apps/web`.
- Uses `registerShutdown` from `@menuza/orpc-server` for graceful shutdown.
- Compiled artifact: `bun run build` → `dist/tenant` (compile flags owned by root AGENTS.md). Images build via `bun run scripts/docker-build.ts tenant`.
- `HOST` env (default `127.0.0.1`) exists for Docker; the image sets `HOST=0.0.0.0`. Dev stays loopback.
- Deny-by-default: the health probe and the push routes (public key, preferences,
  subscriptions) are exposed; every authenticated push route requires a tenant + member
  session.
- Serves the same router over two mounts: `/rpc` (RPC protocol) and `/openapi` (RESTful
  OpenAPI protocol, always `no-store`). Both come from `@menuza/orpc-server`; the OpenAPI
  document is committed at `apps/orpc-server/openapi/tenant.json`.
- Also mounts three non-router surfaces, none of which the RPC/OpenAPI prefixes touch:
  `/oauth/*` + `/.well-known/oauth-authorization-server` (`src/oauth.ts`) and the remote
  MCP endpoint `/mcp` (`src/mcp/server.ts`). Both are reached through the web app's
  rewrite, so `apps/web` is the only public origin; `apps/web/next.config.ts` rewrites
  `/mcp` and `src/proxy.ts` lists it in `API_PREFIXES`.
  - `POST /mcp` authenticates the bearer token once, then delegates each tool call to a
    panel procedure over `@orpc/server`'s `call()` with the same `Authorization` header,
    so authorization runs exactly where it does for a dashboard request. It refuses with
    403 `integration_disabled` unless the store switched `mcp-dashboard` on: the token
    proves who the member is, the switch proves the store agreed.
  - A stateless `McpServer` + `WebStandardStreamableHTTPServerTransport` per request
    (`sessionIdGenerator: undefined`) — the bearer token is the whole session. Each first
    use records an `McpSession` row keyed by the token digest, which is what the dashboard
    lists and revokes.
- Tenant-scoped queries MUST carry explicit `tenantId` filters — middleware does NOT scope Prisma automatically.
- `initSentry({ service: "tenant" })` and `initOtel({ service: "tenant" })` run at startup;
  `shutdownOtel()` flushes pending spans on shutdown.
