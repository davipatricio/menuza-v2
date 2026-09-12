# @menuza/shared

- Browser-safe contract package. NO server-only imports, NO env reads, NO database access.
- Two explicit entrypoints: `@menuza/shared/commerce` and `@menuza/shared/tenant`.
- Contracts are defined first; implementations consume them. Changes go contract → server, never the reverse.
- All inputs/outputs validated with Zod.
- Tenant management contract exposes only the health probe in this phase. No anonymous management operations.

## Distribution

- Source-based workspace. Consumers import the TS source directly via Bun/Next.
