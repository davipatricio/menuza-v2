/**
 * Internal host-resolution procedure tests. Run under `bun test`: the token
 * gate short-circuits before any query and the `Domain` lookup is mocked, so no
 * infrastructure is needed.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { call, ORPCError } from "@orpc/server";
import { db } from "@menuza/db";
import { internalSubdomainRouter } from "../src/domains/tenant/subdomains/internal/router.ts";

const ENV_VAR = "INTERNAL_API_SECRET";

function reqHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers(headers);
}

describe("internal resolveHost", () => {
  const originalSecret = process.env[ENV_VAR];
  const originalWhere = db.orm.public.Domain.where;

  beforeEach(() => {
    process.env[ENV_VAR] = "test-internal-secret";
  });

  afterEach(() => {
    db.orm.public.Domain.where = originalWhere;

    if (originalSecret !== undefined) process.env[ENV_VAR] = originalSecret;
    else delete process.env[ENV_VAR];
  });

  /** Mock the `where(...).select("tenantId").first()` lookup shape. */
  function mockDomainLookup(row: { tenantId: string } | null): void {
    // SAFETY: Mocking the Domain query builder for the test environment; only
    // the `where(...).select(...).first()` chain the implementation uses is
    // provided, and the runtime never calls anything else here.
    db.orm.public.Domain.where = ((filter: { host: string }) => ({
      select: () => ({
        first: async () => (row ? { tenantId: row.tenantId, host: filter.host } : null),
      }),
    })) as any;
  }

  test("rejects without the internal token", async () => {
    try {
      await call(
        internalSubdomainRouter.resolveHost,
        { host: "store.localhost" },
        { context: { reqHeaders: reqHeaders() } },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ORPCError);
      // SAFETY: `instanceof` above proves the shape; the cast only narrows the
      // `code` field read below.
      expect((err as ORPCError<"UNAUTHORIZED", { code: "UNAUTHORIZED" }>).code).toBe(
        "UNAUTHORIZED",
      );
    }
  });

  test("returns the tenantId for a known host when the token matches", async () => {
    mockDomainLookup({ tenantId: "tenant-abc" });

    const result = await call(
      internalSubdomainRouter.resolveHost,
      { host: "store.localhost" },
      {
        context: { reqHeaders: reqHeaders({ "x-menuza-internal-token": "test-internal-secret" }) },
      },
    );

    expect(result).toEqual({ tenantId: "tenant-abc" });
  });

  test("returns tenantId=null for an unknown host when the token matches", async () => {
    mockDomainLookup(null);

    const result = await call(
      internalSubdomainRouter.resolveHost,
      { host: "nope.localhost" },
      {
        context: { reqHeaders: reqHeaders({ "x-menuza-internal-token": "test-internal-secret" }) },
      },
    );

    expect(result).toEqual({ tenantId: null });
  });
});
