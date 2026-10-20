import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getOpenAPIMeta, openapi } from "@orpc/openapi";
import { implement, os } from "@orpc/server";
import type { RequestHeadersHandlerPluginContext } from "@orpc/server/plugins";
import { commerceContractObject } from "@menuza/shared/commerce";
import { tenantContractObject } from "@menuza/shared/tenant";
import { buildOpenApiFetch } from "../src/fetch.ts";
import {
  buildCommerceOpenApiDocument,
  buildTenantOpenApiDocument,
  OPENAPI_DOCUMENT_FILES,
} from "../src/openapi/document.ts";

// The declared routes are the contract of this test: each entry pins the leaf
// procedure on the contract to the REST route it must expose. See
// packages/shared/AGENTS.md for the convention.
const COMMERCE_ROUTES = [
  { procedure: commerceContractObject.health, method: "get", path: "/health" },
  { procedure: commerceContractObject.public.getStore, method: "get", path: "/store" },
  { procedure: commerceContractObject.public.listMenu, method: "get", path: "/menu" },
  { procedure: commerceContractObject.public.listSitemap, method: "get", path: "/sitemap" },
  { procedure: commerceContractObject.orders.create, method: "post", path: "/orders" },
  { procedure: commerceContractObject.orders.get, method: "get", path: "/orders/{code}" },
  {
    procedure: commerceContractObject.orders.transition,
    method: "post",
    path: "/orders/{code}/transition",
  },
  {
    procedure: commerceContractObject.orders.recordPayment,
    method: "post",
    path: "/orders/{code}/payment",
  },
  {
    procedure: commerceContractObject.orders.expire,
    method: "post",
    path: "/orders/{code}/expire",
  },
  { procedure: commerceContractObject.wallet.get, method: "get", path: "/wallet" },
  { procedure: commerceContractObject.wallet.adjust, method: "post", path: "/wallet/adjust" },
] as const;

const TENANT_ROUTES = [
  { procedure: tenantContractObject.health, method: "get", path: "/health" },
  { procedure: tenantContractObject.push.getPublicKey, method: "get", path: "/push/public-key" },
  { procedure: tenantContractObject.push.subscribe, method: "post", path: "/push/subscriptions" },
  {
    procedure: tenantContractObject.push.unsubscribe,
    method: "delete",
    path: "/push/subscriptions",
  },
  { procedure: tenantContractObject.push.getPreferences, method: "get", path: "/push/preferences" },
  {
    procedure: tenantContractObject.push.updatePreferences,
    method: "put",
    path: "/push/preferences",
  },
  {
    procedure: tenantContractObject.internal.resolveHost,
    method: "get",
    path: "/internal/resolve-host",
  },
  { procedure: tenantContractObject.session.login, method: "post", path: "/session/login" },
  { procedure: tenantContractObject.session.logout, method: "post", path: "/session/logout" },
  { procedure: tenantContractObject.session.current, method: "get", path: "/session/current" },
  { procedure: tenantContractObject.session.register, method: "post", path: "/session/register" },
  {
    procedure: tenantContractObject.account.listSessions,
    method: "get",
    path: "/account/sessions",
  },
  {
    procedure: tenantContractObject.account.changePassword,
    method: "put",
    path: "/account/password",
  },
  {
    procedure: tenantContractObject.account.revokeSession,
    method: "delete",
    path: "/account/sessions/{sessionId}",
  },
  {
    procedure: tenantContractObject.account.revokeOtherSessions,
    method: "post",
    path: "/account/sessions/revoke-others",
  },
  {
    procedure: tenantContractObject.panel.getStore,
    method: "get",
    path: "/panel/stores/{storeSlug}",
  },
  { procedure: tenantContractObject.panel.createStore, method: "post", path: "/panel/stores" },
  {
    procedure: tenantContractObject.panel.listOrders,
    method: "get",
    path: "/panel/stores/{storeSlug}/orders",
  },
  {
    procedure: tenantContractObject.panel.getOrder,
    method: "get",
    path: "/panel/stores/{storeSlug}/orders/{orderCode}",
  },
  {
    procedure: tenantContractObject.panel.getOrderTransitions,
    method: "get",
    path: "/panel/stores/{storeSlug}/orders/{orderCode}/transitions",
  },
  {
    procedure: tenantContractObject.panel.transitionOrder,
    method: "post",
    path: "/panel/stores/{storeSlug}/orders/{orderCode}/transition",
  },
  {
    procedure: tenantContractObject.panel.recordOrderPayment,
    method: "post",
    path: "/panel/stores/{storeSlug}/orders/{orderCode}/payment",
  },
  {
    procedure: tenantContractObject.panel.listCustomers,
    method: "get",
    path: "/panel/stores/{storeSlug}/customers",
  },
  {
    procedure: tenantContractObject.panel.getCustomer,
    method: "get",
    path: "/panel/stores/{storeSlug}/customers/{customerId}",
  },
  {
    procedure: tenantContractObject.panel.listProducts,
    method: "get",
    path: "/panel/stores/{storeSlug}/products",
  },
  {
    procedure: tenantContractObject.panel.getProduct,
    method: "get",
    path: "/panel/stores/{storeSlug}/products/{productId}",
  },
  {
    procedure: tenantContractObject.panel.createProduct,
    method: "post",
    path: "/panel/stores/{storeSlug}/products",
  },
  {
    procedure: tenantContractObject.panel.updateProduct,
    method: "put",
    path: "/panel/stores/{storeSlug}/products/{productId}",
  },
  {
    procedure: tenantContractObject.panel.deleteProduct,
    method: "delete",
    path: "/panel/stores/{storeSlug}/products/{productId}",
  },
  {
    procedure: tenantContractObject.panel.listCategories,
    method: "get",
    path: "/panel/stores/{storeSlug}/categories",
  },
  {
    procedure: tenantContractObject.panel.createCategory,
    method: "post",
    path: "/panel/stores/{storeSlug}/categories",
  },
  {
    procedure: tenantContractObject.panel.updateCategory,
    method: "put",
    path: "/panel/stores/{storeSlug}/categories/{categoryId}",
  },
  {
    procedure: tenantContractObject.panel.deleteCategory,
    method: "delete",
    path: "/panel/stores/{storeSlug}/categories/{categoryId}",
  },
  {
    procedure: tenantContractObject.panel.listDepartments,
    method: "get",
    path: "/panel/stores/{storeSlug}/departments",
  },
  {
    procedure: tenantContractObject.panel.createDepartment,
    method: "post",
    path: "/panel/stores/{storeSlug}/departments",
  },
  {
    procedure: tenantContractObject.panel.updateDepartment,
    method: "put",
    path: "/panel/stores/{storeSlug}/departments/{departmentId}",
  },
  {
    procedure: tenantContractObject.panel.deleteDepartment,
    method: "delete",
    path: "/panel/stores/{storeSlug}/departments/{departmentId}",
  },
  {
    procedure: tenantContractObject.panel.listTags,
    method: "get",
    path: "/panel/stores/{storeSlug}/tags",
  },
  {
    procedure: tenantContractObject.panel.createTag,
    method: "post",
    path: "/panel/stores/{storeSlug}/tags",
  },
  {
    procedure: tenantContractObject.panel.updateTag,
    method: "put",
    path: "/panel/stores/{storeSlug}/tags/{tagId}",
  },
  {
    procedure: tenantContractObject.panel.deleteTag,
    method: "delete",
    path: "/panel/stores/{storeSlug}/tags/{tagId}",
  },
  {
    procedure: tenantContractObject.panel.listKits,
    method: "get",
    path: "/panel/stores/{storeSlug}/kits",
  },
  {
    procedure: tenantContractObject.panel.listCoupons,
    method: "get",
    path: "/panel/stores/{storeSlug}/coupons",
  },
  {
    procedure: tenantContractObject.panel.createCoupon,
    method: "post",
    path: "/panel/stores/{storeSlug}/coupons",
  },
  {
    procedure: tenantContractObject.panel.updateCoupon,
    method: "put",
    path: "/panel/stores/{storeSlug}/coupons/{couponId}",
  },
  {
    procedure: tenantContractObject.panel.deleteCoupon,
    method: "delete",
    path: "/panel/stores/{storeSlug}/coupons/{couponId}",
  },
  {
    procedure: tenantContractObject.panel.getStoreSeo,
    method: "get",
    path: "/panel/stores/{storeSlug}/seo",
  },
  {
    procedure: tenantContractObject.panel.saveStoreSeo,
    method: "put",
    path: "/panel/stores/{storeSlug}/seo",
  },
  {
    procedure: tenantContractObject.panel.listSeoEntities,
    method: "get",
    path: "/panel/stores/{storeSlug}/seo/entities",
  },
  {
    procedure: tenantContractObject.panel.getSeo,
    method: "get",
    path: "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
  },
  {
    procedure: tenantContractObject.panel.saveSeo,
    method: "put",
    path: "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
  },
  {
    procedure: tenantContractObject.panel.revertSeo,
    method: "delete",
    path: "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
  },
  {
    procedure: tenantContractObject.panel.listAuditLogs,
    method: "get",
    path: "/panel/stores/{storeSlug}/audit-logs",
  },
  {
    procedure: tenantContractObject.panel.listTeamMembers,
    method: "get",
    path: "/panel/stores/{storeSlug}/team",
  },
  {
    procedure: tenantContractObject.profile.saveOnboarding,
    method: "post",
    path: "/profile/onboarding",
  },
] as const;

type OpenApiDocument = Awaited<ReturnType<typeof buildTenantOpenApiDocument>>;

const OPENAPI_DIR = join(import.meta.dir, "..", "openapi");

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
  "query",
]);

function operationCount(document: OpenApiDocument): number {
  return Object.values(document.paths).reduce(
    (total, pathItem) =>
      total + Object.keys(pathItem).filter((key) => HTTP_METHODS.has(key)).length,
    0,
  );
}

/** Serialize exactly like `openapi:generate` so the committed file is comparable. */
function serialize(document: OpenApiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

describe("OpenAPI export", () => {
  test("the commerce contract and document agree on every route", async () => {
    const document = await buildCommerceOpenApiDocument();

    for (const route of COMMERCE_ROUTES) {
      const meta = getOpenAPIMeta(route.procedure);

      expect(meta?.method?.toLowerCase()).toBe(route.method);
      expect(meta?.path).toBe(route.path);
      expect(document.paths[route.path]?.[route.method]).toBeDefined();
    }

    expect(operationCount(document)).toBe(COMMERCE_ROUTES.length);
  });

  test("the tenant contract and document agree on every route", async () => {
    const document = await buildTenantOpenApiDocument();

    for (const route of TENANT_ROUTES) {
      const meta = getOpenAPIMeta(route.procedure);

      expect(meta?.method?.toLowerCase()).toBe(route.method);
      expect(meta?.path).toBe(route.path);
      expect(document.paths[route.path]?.[route.method]).toBeDefined();
    }

    expect(operationCount(document)).toBe(TENANT_ROUTES.length);
  });

  test("each document declares the /openapi server base", async () => {
    expect((await buildCommerceOpenApiDocument()).servers).toEqual([{ url: "/openapi" }]);
    expect((await buildTenantOpenApiDocument()).servers).toEqual([{ url: "/openapi" }]);
  });

  // Cross-run drift guard: a fresh generation must byte-match the committed
  // file. In-process double-generation cannot catch a timestamp the generator
  // might add (both calls run at the same instant) nor prove stability.
  test("the committed documents match a fresh generation", async () => {
    const commerce = serialize(await buildCommerceOpenApiDocument());
    const tenant = serialize(await buildTenantOpenApiDocument());

    expect(await readFile(join(OPENAPI_DIR, OPENAPI_DOCUMENT_FILES.commerce), "utf8")).toBe(
      commerce,
    );
    expect(await readFile(join(OPENAPI_DIR, OPENAPI_DOCUMENT_FILES.tenant), "utf8")).toBe(tenant);
  });
});

describe("OpenAPI handler", () => {
  test("serves on its own prefix and echoes the request id on a miss", async () => {
    const openApiFetch = buildOpenApiFetch({}, { service: "test" });

    const response = await openApiFetch(
      new Request("http://localhost/openapi/missing"),
      "/openapi",
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  test("serves a matched route with its body and a no-store cache header", async () => {
    const commerceOs = implement(commerceContractObject);

    const router = {
      health: commerceOs.health.handler(() => ({
        status: "ok" as const,
        service: "commerce" as const,
        timestamp: new Date().toISOString(),
      })),
    };

    const openApiFetch = buildOpenApiFetch(router, { service: "test" });

    const response = await openApiFetch(new Request("http://localhost/openapi/health"), "/openapi");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    // SAFETY: the stub handler above returns this exact shape.
    const body = (await response.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("commerce");
  });

  test("rejects a wrong method on a matched path", async () => {
    const commerceOs = implement(commerceContractObject);

    const router = {
      health: commerceOs.health.handler(() => ({
        status: "ok" as const,
        service: "commerce" as const,
        timestamp: new Date().toISOString(),
      })),
    };

    const openApiFetch = buildOpenApiFetch(router, { service: "test" });

    const response = await openApiFetch(
      new Request("http://localhost/openapi/health", { method: "POST" }),
      "/openapi",
    );

    expect(response.status).not.toBe(200);
  });

  // The tenant middleware reads `context.reqHeaders`, which
  // `RequestHeadersHandlerPlugin` populates. If the OpenAPI handler ever
  // dropped that plugin, `require: "tenant"` would silently fall back to its
  // missing-tenant branch, so this guards the property most likely to regress.
  test("exposes x-menuza-tenant-id to middleware under the OpenAPI handler", async () => {
    const echoTenantHeader = os
      .$context<RequestHeadersHandlerPluginContext>()
      .meta(
        openapi({
          method: "GET",
          path: "/echo-tenant",
          operationId: "echoTenantHeader",
          summary: "Test-only route: echoes the tenant header back.",
          tags: ["test"],
        }),
      )
      .use(async ({ context, next }) => {
        const tenantId = context.reqHeaders?.get("x-menuza-tenant-id") ?? null;

        return next({ context: { tenantId } });
      })
      .handler(({ context }) => ({ tenantId: context.tenantId }));

    const openApiFetch = buildOpenApiFetch({ echoTenantHeader }, { service: "test" });

    const response = await openApiFetch(
      new Request("http://localhost/openapi/echo-tenant", {
        headers: { "x-menuza-tenant-id": "tenant-abc" },
      }),
      "/openapi",
    );

    expect(response.status).toBe(200);

    // SAFETY: the stub handler above returns this exact shape.
    const body = (await response.json()) as { tenantId: string | null };
    expect(body.tenantId).toBe("tenant-abc");
  });
});
