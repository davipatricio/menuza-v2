/**
 * Management (tenant) contract. Browser-safe: types and Valibot schemas only.
 * Public surface exposes the health probe and the push routes. Any future
 * management operation MUST require an authenticated session — there is no
 * public anonymous management API.
 *
 * The `internal` subdomain is service-to-service only: its procedures are
 * gated by the shared internal token (see `@menuza/orpc-server/internal`) and
 * are never reachable with a browser session, so no public route may depend on
 * them.
 */
import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import * as v from "valibot";
import { sharedErrorCodes } from "../errors/index.ts";
import { pushContractObject } from "../push/contracts.ts";
import {
  panelContractObject,
  profileContractObject,
  sessionContractObject,
} from "../panel/contracts.ts";

export const healthInput = v.strictObject({});

export const healthOutput = v.object({
  status: v.literal("ok"),
  service: v.literal("tenant"),
  timestamp: v.pipe(v.string(), v.isoTimestamp()),
});

export const resolveHostInput = v.strictObject({
  host: v.pipe(v.string(), v.nonEmpty(), v.maxLength(253)),
});

export const resolveHostOutput = v.object({
  tenantId: v.nullable(v.string()),
});

export const tenantContract = oc.errors({
  ...sharedErrorCodes,
});

export const health = tenantContract
  .meta(
    openapi({
      method: "GET",
      path: "/health",
      operationId: "getTenantHealth",
      summary: "Sonda de saúde do serviço de gestão (tenant).",
      tags: ["health"],
    }),
  )
  .input(healthInput)
  .output(healthOutput);

export const resolveHost = tenantContract
  .meta(
    openapi({
      method: "GET",
      path: "/internal/resolve-host",
      operationId: "resolveTenantByStorefrontHost",
      summary: "Resolve um host de storefront para o tenant correspondente (uso interno).",
      tags: ["internal"],
    }),
  )
  .input(resolveHostInput)
  .output(resolveHostOutput);

export const internalContractObject = {
  resolveHost,
};

export const tenantContractObject = {
  health,
  push: pushContractObject,
  session: sessionContractObject,
  panel: panelContractObject,
  profile: profileContractObject,
  internal: internalContractObject,
};

export type TenantRouterContract = typeof tenantContractObject;
