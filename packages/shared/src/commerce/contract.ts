/**
 * Public commerce contract. Browser-safe: types and Valibot schemas only.
 * NO server-only imports, NO database access, NO env reads.
 */
import { oc } from "@orpc/contract";
import * as v from "valibot";
import { sharedErrorCodes } from "../errors/index.ts";

export const healthInput = v.strictObject({});

export const healthOutput = v.object({
  status: v.literal("ok"),
  service: v.literal("commerce"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
});

export const commerceContract = oc.errors({
  ...sharedErrorCodes,
  INVALID_INPUT: {
    message: "Entrada inválida.",
    data: v.object({ issues: v.array(v.object({ path: v.string(), message: v.string() })) }),
  },
});

export const health = commerceContract.input(healthInput).output(healthOutput);

// Object consumed by `createORPCClient<typeof contract>`.
export const commerceContractObject = {
  health,
};

export type CommerceRouterContract = typeof commerceContractObject;
