/**
 * Tenant / internal subdomain router. Service-to-service, token-gated routes.
 */
import { resolveHostImpl } from "./resolveHost.impl.ts";

export const internalSubdomainRouter = {
  resolveHost: resolveHostImpl,
};

export type InternalSubdomainRouter = typeof internalSubdomainRouter;
