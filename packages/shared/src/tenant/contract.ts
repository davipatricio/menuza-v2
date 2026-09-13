/**
 * Management (tenant) contract. Browser-safe: types and Zod schemas only.
 * Public surface exposes ONLY the health contract. Any future management
 * operation MUST require an authenticated session — there is no public
 * anonymous management API.
 */
import { oc } from "@orpc/contract";
import { z } from "zod";
import { sharedErrorCodes } from "../errors/index.ts";

export const healthInput = z.object({}).strict();

export const healthOutput = z.object({
  status: z.literal("ok"),
  service: z.literal("tenant"),
  timestamp: z.string().datetime(),
});

export const tenantContract = oc.errors({
  ...sharedErrorCodes,
});

export const health = tenantContract.input(healthInput).output(healthOutput);

export const tenantContractObject = {
  health,
};

export type TenantRouterContract = typeof tenantContractObject;
