/**
 * Commerce / public / health implementation.
 */
import { implement } from "@orpc/server";
import { commerceContractObject } from "@menuza/shared/commerce";

const os = implement(commerceContractObject);

export const healthImpl = os.health.handler(() => ({
  status: "ok" as const,
  service: "commerce" as const,
  timestamp: new Date().toISOString(),
}));

export type HealthImpl = typeof healthImpl;
