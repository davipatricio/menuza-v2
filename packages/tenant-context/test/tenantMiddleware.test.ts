/**
 * Tenant middleware unit tests. Run under `bun test` (no infra).
 *
 * Each case composes a one-shot procedure with the middleware via `.use(...)`,
 * then calls it with a stub `Headers` as the request header source (what
 * `RequestHeadersHandlerPlugin` injects as `context.reqHeaders`).
 */
import { describe, expect, test } from "bun:test";
import { call, os, ORPCError } from "@orpc/server";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { tenantMiddleware } from "../src/index.ts";

function reqHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers(headers);
}

describe("tenantMiddleware", () => {
  test("throws TENANT_NOT_RESOLVED when header missing and require='tenant'", async () => {
    const proc = os
      .use(tenantMiddleware({ require: "tenant" }))
      .handler(({ context }) => ({ tenantId: context.tenantId }));

    try {
      await call(proc, undefined, { context: { reqHeaders: reqHeaders() } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows the
      // `code`/`data` fields read below.
      const rpcErr = err as ORPCError<"TENANT_NOT_RESOLVED", { code: "TENANT_NOT_RESOLVED" }>;
      expect(rpcErr.code).toBe("TENANT_NOT_RESOLVED");
      expect(rpcErr.data).toEqual({ code: "TENANT_NOT_RESOLVED" });
      expect(rpcErr.message).toBe(sharedErrorCodes.TENANT_NOT_RESOLVED.message);
    }
  });

  test("returns context with tenantId when header present and require='tenant'", async () => {
    const proc = os
      .use(tenantMiddleware({ require: "tenant" }))
      .handler(({ context }) => ({ tenantId: context.tenantId }));

    const result = await call(proc, undefined, {
      context: { reqHeaders: reqHeaders({ "x-menuza-tenant-id": "tenant-abc" }) },
    });

    expect(result).toEqual({ tenantId: "tenant-abc" });
  });

  test("returns context with tenantId=undefined when header missing and require='optional'", async () => {
    const proc = os
      .use(tenantMiddleware({ require: "optional" }))
      .handler(({ context }) => ({ tenantId: context.tenantId }));

    const result = await call(proc, undefined, { context: { reqHeaders: reqHeaders() } });

    expect(result).toEqual({ tenantId: undefined });
  });

  test("honors a custom headerName", async () => {
    const proc = os
      .use(tenantMiddleware({ require: "tenant", headerName: "x-tenant" }))
      .handler(({ context }) => ({ tenantId: context.tenantId }));

    const result = await call(proc, undefined, {
      context: { reqHeaders: reqHeaders({ "x-tenant": "tenant-xyz" }) },
    });

    expect(result).toEqual({ tenantId: "tenant-xyz" });
  });
});
