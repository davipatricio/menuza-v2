# @menuza/shared

- Browser-safe contract package. NO server-only imports, NO env reads, NO database access.
- Two explicit entrypoints: `@menuza/shared/commerce` and `@menuza/shared/tenant`.
- Contracts are defined first; implementations consume them. Changes go contract → server, never the reverse.
- All inputs/outputs validated with Zod.
- Tenant management contract exposes only the health probe in this phase. No anonymous management operations.

## Subpath: @menuza/shared/errors

Global catalog of canonical RPC error codes (`sharedErrorCodes`). Apps spread
the **raw catalog object** into their contract: `oc.errors({ ...sharedErrorCodes,
...local })`. Never spread an oRPC builder — `oc.errors()` returns a builder
that does not satisfy `ErrorMap` (spreading it nests a `~orpc` key and breaks
the contract).
Severity classifier `isFourXxCode` flags codes that should not hit Sentry
(4xx) vs codes that should (5xx and unknown).

## Distribution

- Source-based workspace. Consumers import the TS source directly via Bun/Next.
