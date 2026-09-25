/**
 * Tenant / public / health implementation.
 */
import { implement } from "@orpc/server";
import { tenantContractObject } from "@menuza/shared/tenant";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";

const os = implement(tenantContractObject);

export const healthImpl = os.health.use(tenantMiddleware({ require: "optional" })).handler(() => ({
  status: "ok" as const,
  service: "tenant" as const,
  timestamp: new Date().toISOString(),
}));

export type HealthImpl = typeof healthImpl;
