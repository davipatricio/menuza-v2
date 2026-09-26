/**
 * Tenant domain router. Aggregates subdomain implementations.
 */
import { healthImpl } from "./subdomains/public/health.impl.ts";
import { pushSubdomainRouter } from "./subdomains/push/router.ts";
import { sessionSubdomainRouter } from "./subdomains/session/router.ts";
import { panelSubdomainRouter } from "./subdomains/panel/router.ts";
import { profileSubdomainRouter } from "./subdomains/profile/router.ts";
import { internalSubdomainRouter } from "./subdomains/internal/router.ts";

export const tenantDomainRouter = {
  health: healthImpl,
  push: pushSubdomainRouter,
  session: sessionSubdomainRouter,
  panel: panelSubdomainRouter,
  profile: profileSubdomainRouter,
  internal: internalSubdomainRouter,
};

export type TenantDomainRouter = typeof tenantDomainRouter;
