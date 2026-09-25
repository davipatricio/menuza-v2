/**
 * Builds the OpenAPI 3.2 documents from the shared contracts.
 *
 * Generation starts from the *contracts* (`packages/shared`) rather than the
 * implemented routers on purpose: it keeps this build-time module free of
 * `@menuza/db` and env side effects (see apps/orpc-server/AGENTS.md), and the
 * routers carry the same `openapi()` metadata because they are produced from
 * these contracts with `implement()`.
 */
import { OpenAPIGenerator } from "@orpc/openapi";
import { ValibotToJsonSchemaConverter } from "@orpc/valibot";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantContractObject } from "@menuza/shared/tenant";

/** Services owning a contract, in a stable order for deterministic generation. */
export const OPENAPI_SERVICES = ["commerce", "tenant"] as const;

export type OpenApiService = (typeof OPENAPI_SERVICES)[number];

/** File names written into `apps/orpc-server/openapi/`. */
export const OPENAPI_DOCUMENT_FILES: Record<OpenApiService, string> = {
  commerce: "commerce.json",
  tenant: "tenant.json",
};

const generator = new OpenAPIGenerator({
  converters: [new ValibotToJsonSchemaConverter()],
});

export function buildCommerceOpenApiDocument() {
  return generator.generate(commerceContractObject, {
    version: "3.2.0",
    base: {
      info: { title: "Menuza Commerce API", version: "0.0.0" },
      servers: [{ url: "/openapi" }],
    },
  });
}

export function buildTenantOpenApiDocument() {
  return generator.generate(tenantContractObject, {
    version: "3.2.0",
    base: {
      info: { title: "Menuza Tenant API", version: "0.0.0" },
      servers: [{ url: "/openapi" }],
    },
  });
}

export function buildOpenApiDocument(service: OpenApiService) {
  return service === "commerce" ? buildCommerceOpenApiDocument() : buildTenantOpenApiDocument();
}
