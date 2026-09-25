# apps/orpc-server (library)

- This workspace is a **library**, NOT a deployable service.
- It has no listening process, dev server, or Docker artifact.
- Side-effect-free imports: do NOT read env, open DB connections, or initialize singletons at import time.
- Contains the shared fetch/RPC plumbing (`buildRpcFetch`) and a tiny structured logger.
- Router implementations live in the library packages (`packages/api-commerce`,
  `packages/api-tenant`) under `src/domains/<domain>/subdomains/<subdomain>/contracts/`
  (Valibot + oRPC contract) and `<subdomain>/<name>.impl.ts` (procedure implementation).
  Domain routers aggregate subdomains.
- Exports `initSentry({ service })` and `getTracer()` for observability. Sentry is a no-op
  without `SENTRY_DSN`; `initSentry` applies the shared LGPD lock-down (`dataCollection` +
  `beforeSend` scrubber from `@menuza/shared/sentry-privacy`).
- `./otel.ts` owns the tracing SDK: `initOtel({ service })` wires the OTLP exporter, W3C
  propagator, async-context manager, and a `fetch` wrapper; `shutdownOtel()` flushes.
  Both are no-ops without `OTEL_EXPORTER_OTLP_ENDPOINT` and read no env at import time.
  `buildRpcFetch` extracts an inbound `traceparent`, so RPC spans continue the caller's
  trace instead of rooting a new one.
- `buildRpcFetch` and `buildOpenApiFetch` serve the **same router** over two protocols on
  dedicated prefixes: `/rpc` (RPC) and `/openapi` (RESTful), both mounted by
  `apps/commerce` and `apps/tenant`. They share `buildRequestFetch`, so the request-id
  echo, OTel span, structured logs, and 4xx/5xx Sentry split are identical; the OpenAPI
  handler is additive and the RPC prefix/response shape are untouched.
- `./openapi/document.ts` builds the OpenAPI 3.2 documents from the `@menuza/shared`
  **contracts** (not the implemented routers), so this build-time module imports no
  `@menuza/db` and reads no env. The routers carry the same route metadata because
  `implement()` derives them from those contracts.
- `bun run openapi:generate` writes `apps/orpc-server/openapi/{commerce,tenant}.json`
  deterministically from those documents, and those documents are **committed** — not
  gitignored like `packages/db/prisma/generated/**`, whose output the build graph
  regenerates while this script does not. Each document declares
  `servers: [{ url: "/openapi" }]`, matching the mount used by `apps/commerce` and
  `apps/tenant`. A route change without regenerating is a review error;
  `test/openapi.test.ts` compares the generated document against the committed file and
  fails on drift.
