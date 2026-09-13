/**
 * Tenant context shapes. Carried in `context.tenantId` after the
 * `@menuza/tenant-context` middleware runs.
 *
 * `TenantContext` is the narrowed form (string) used by procedures that
 * require a tenant. `OptionalTenantContext` is the wide form (string | undefined)
 * used by procedures that may run without one (e.g. public health probes).
 */
export type TenantContext = {
  readonly tenantId: string;
};

export type OptionalTenantContext = {
  readonly tenantId?: string;
};
