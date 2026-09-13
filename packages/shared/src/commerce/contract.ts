/**
 * Public commerce contract. Browser-safe: types and Zod schemas only.
 * NO server-only imports, NO database access, NO env reads.
 */
import { oc } from "@orpc/contract";
import { z } from "zod";
import { sharedErrorCodes } from "../errors/index.ts";

export const healthInput = z.object({}).strict();

export const healthOutput = z.object({
  status: z.literal("ok"),
  service: z.literal("commerce"),
  timestamp: z.string().datetime(),
});

export const commerceContract = oc.errors({
  ...sharedErrorCodes,
  INVALID_INPUT: {
    message: "Entrada inválida.",
    data: z.object({ issues: z.array(z.object({ path: z.string(), message: z.string() })) }),
  },
});

export const health = commerceContract.input(healthInput).output(healthOutput);

// Object consumed by `createORPCClient<typeof contract>`.
export const commerceContractObject = {
  health,
};

export type CommerceRouterContract = typeof commerceContractObject;
