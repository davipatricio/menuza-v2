/**
 * Tenant domain router. Aggregates subdomain implementations.
 */
import { healthImpl } from "./subdomains/public/health.impl.ts";
import { pushSubdomainRouter } from "./subdomains/push/router.ts";
import { internalSubdomainRouter } from "./subdomains/internal/router.ts";

export const tenantDomainRouter = {
  health: healthImpl,
  push: pushSubdomainRouter,
  internal: internalSubdomainRouter,
};

export type TenantDomainRouter = typeof tenantDomainRouter;
