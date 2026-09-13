# @menuza/tenant-context

- Library package. Owns the tenant middleware.
- Consumed by `@menuza/api-commerce` today; `@menuza/api-tenant` wires it when
  management procedures land.
- Reads only `x-menuza-tenant-id` from the request; never queries the database.
- The web proxy (`apps/web/src/proxy.ts`) writes this header server-side from the
  host->tenant map; clients never set it directly.
- `require: "tenant"` narrows `context.tenantId: string`; `require: "optional"`
  keeps it `string | undefined`. Missing header AND `require: "tenant"` throws
  `ORPCError("TENANT_NOT_RESOLVED", ...)`.
- Server-only: do NOT import from browser code.
