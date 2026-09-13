/**
 * Management (tenant) contract. Browser-safe: types and Valibot schemas only.
 * Public surface exposes ONLY the health contract. Any future management
 * operation MUST require an authenticated session — there is no public
 * anonymous management API.
 */
import { oc } from "@orpc/contract";
import * as v from "valibot";
import { sharedErrorCodes } from "../errors/index.ts";

export const healthInput = v.strictObject({});

export const healthOutput = v.object({
  status: v.literal("ok"),
  service: v.literal("tenant"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
});

export const tenantContract = oc.errors({
  ...sharedErrorCodes,
});

export const health = tenantContract.input(healthInput).output(healthOutput);

export const tenantContractObject = {
  health,
};

export type TenantRouterContract = typeof tenantContractObject;
