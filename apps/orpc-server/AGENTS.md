# apps/orpc-server (library)

- This workspace is a **library**, NOT a deployable service.
- It has no listening process, dev server, or Docker artifact.
- Side-effect-free imports: do NOT read env, open DB connections, or initialize singletons at import time.
- Contains the shared fetch/RPC plumbing (`buildRpcFetch`) and a tiny structured logger.
- Router implementations live in the library packages (`packages/api-commerce`,
  `packages/api-tenant`) under `src/domains/<domain>/subdomains/<subdomain>/contracts/`
  (Zod + oRPC contract) and `<subdomain>/<name>.impl.ts` (procedure implementation).
  Domain routers aggregate subdomains.
- Exports `initSentry({ service })` and `getTracer()` for observability. Sentry is a no-op
  without `SENTRY_DSN`; OpenTelemetry has no exporter.
