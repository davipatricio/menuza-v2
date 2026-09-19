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
