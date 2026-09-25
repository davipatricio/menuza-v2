/**
 * Internal token middleware unit tests. Run under `bun test` (no infra).
 *
 * Each case composes a one-shot procedure with the middleware via `.use(...)`,
 * then calls it with a stub `Headers` as the request header source (what
 * `RequestHeadersHandlerPlugin` injects as `context.reqHeaders`).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { call, os, ORPCError } from "@orpc/server";
import { sharedErrorCodes } from "@menuza/shared/errors";
import { internalTokenMiddleware } from "../src/internal/index.ts";

const ENV_VAR = "INTERNAL_API_SECRET";

function reqHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers(headers);
}

const proc = os.use(internalTokenMiddleware()).handler(() => ({ ok: true }));

describe("internalTokenMiddleware", () => {
  const original = process.env[ENV_VAR];

  beforeEach(() => {
    process.env[ENV_VAR] = "test-internal-secret";
  });

  afterEach(() => {
    if (original !== undefined) process.env[ENV_VAR] = original;
    else delete process.env[ENV_VAR];
  });

  test("rejects with INTERNAL when INTERNAL_API_SECRET is unset", async () => {
    delete process.env[ENV_VAR];

    try {
      await call(proc, undefined, { context: { reqHeaders: reqHeaders() } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows the
      // `code`/`data` fields read below.
      const rpcErr = err as ORPCError<"INTERNAL", { code: "INTERNAL" }>;
      expect(rpcErr.code).toBe("INTERNAL");
      expect(rpcErr.data).toEqual({ code: "INTERNAL" });
      expect(rpcErr.message).toBe(sharedErrorCodes.INTERNAL.message);
    }
  });

  test("rejects with UNAUTHORIZED when the token header is missing", async () => {
    try {
      await call(proc, undefined, { context: { reqHeaders: reqHeaders() } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows the
      // `code`/`data` fields read below.
      const rpcErr = err as ORPCError<"UNAUTHORIZED", { code: "UNAUTHORIZED" }>;
      expect(rpcErr.code).toBe("UNAUTHORIZED");
      expect(rpcErr.data).toEqual({ code: "UNAUTHORIZED" });
    }
  });

  test("rejects with UNAUTHORIZED when the token is wrong", async () => {
    try {
      await call(proc, undefined, {
        context: { reqHeaders: reqHeaders({ "x-menuza-internal-token": "not-the-secret" }) },
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows the
      // `code` field read below.
      expect((err as ORPCError).code).toBe("UNAUTHORIZED");
    }
  });

  test("continues when the token matches", async () => {
    const result = await call(proc, undefined, {
      context: { reqHeaders: reqHeaders({ "x-menuza-internal-token": "test-internal-secret" }) },
    });

    expect(result).toEqual({ ok: true });
  });

  test("honors a custom headerName", async () => {
    const customProc = os
      .use(internalTokenMiddleware({ headerName: "x-internal" }))
      .handler(() => ({ ok: true }));

    const result = await call(customProc, undefined, {
      context: { reqHeaders: reqHeaders({ "x-internal": "test-internal-secret" }) },
    });

    expect(result).toEqual({ ok: true });
  });
});
