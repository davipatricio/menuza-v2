import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call, ORPCError, os } from "@orpc/server";
import { db, TenantIsolationError, unscoped } from "@menuza/db";
import { tenantMiddleware } from "@menuza/orpc-server/tenant";
import {
  authMiddleware,
  createSession,
  hashPassword,
  TENANT_COOKIE_NAME,
} from "@menuza/orpc-server/auth";

function reqHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers(headers);
}

describe.skipIf(!process.env.TEST_INTEGRATION)("Multi-Tenant Isolation End-to-End", () => {
  const memberAId = randomUUID();
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  let sessionAId: string;

  beforeAll(async () => {
    // 1. Seed two distinct tenants
    await db.orm.public.Tenant.create({
      id: tenantAId,
      slug: `tenant-a-${tenantAId.slice(0, 8)}`,
      displayName: "Tenant A",
      updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    });

    await db.orm.public.Tenant.create({
      id: tenantBId,
      slug: `tenant-b-${tenantBId.slice(0, 8)}`,
      displayName: "Tenant B",
      updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    });

    // 2. Seed domain for Tenant A and Tenant B
    await db.orm.public.Domain.create({
      id: randomUUID(),
      host: `store-a-${tenantAId.slice(0, 8)}.local`,
      tenantId: tenantAId,
    });

    await db.orm.public.Domain.create({
      id: randomUUID(),
      host: `store-b-${tenantBId.slice(0, 8)}.local`,
      tenantId: tenantBId,
    });

    // 3. Create Member A with membership ONLY in Tenant A
    const passwordHash = await hashPassword("password123");
    await db.orm.public.Member.create({
      id: memberAId,
      email: `member-a-${memberAId.slice(0, 8)}@menuza.local`,
      passwordHash,
      updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
    });

    await db.orm.public.TenantMembership.create({
      id: randomUUID(),
      memberId: memberAId,
      tenantId: tenantAId,
      role: "owner",
    });

    // 4. Create session for Member A in tenant namespace
    const { id } = await createSession({
      memberId: memberAId,
      namespace: "tenant",
    });

    sessionAId = id;
  });

  afterAll(async () => {
    await unscoped(async () => {
      await db.orm.public.TenantMembership.where({ memberId: memberAId }).deleteAll();
      await db.orm.public.Session.where({ memberId: memberAId }).deleteAll();
      await db.orm.public.Member.where({ id: memberAId }).deleteAll();
      await db.orm.public.Domain.where({ tenantId: tenantAId }).deleteAll();
      await db.orm.public.Domain.where({ tenantId: tenantBId }).deleteAll();
      await db.orm.public.Tenant.where({ id: tenantAId }).deleteAll();
      await db.orm.public.Tenant.where({ id: tenantBId }).deleteAll();
    });
  });

  // Procedure requiring tenant and authenticated tenant session
  const tenantScopedProc = os
    .use(tenantMiddleware({ require: "tenant" }))
    .use(authMiddleware({ namespace: "tenant" }))
    .handler(async ({ context }) => {
      // Query Domain within current tenant scope
      const myDomains = await db.orm.public.Domain.where({
        tenantId: context.session.tenantId,
      }).all();

      return {
        tenantId: context.session.tenantId,
        role: context.session.role,
        domains: myDomains.map((d) => d.host),
      };
    });

  // Procedure attempting cross-tenant read (deliberately tries to query Tenant B while in Tenant A scope)
  const maliciousCrossTenantProc = os
    .use(tenantMiddleware({ require: "tenant" }))
    .use(authMiddleware({ namespace: "tenant" }))
    .handler(async () => {
      // Trying to read Tenant B's domain
      return db.orm.public.Domain.where({
        tenantId: tenantBId,
      }).all();
    });

  // Procedure omitting tenantId in where clause
  const missingFilterProc = os
    .use(tenantMiddleware({ require: "tenant" }))
    .use(authMiddleware({ namespace: "tenant" }))
    .handler(async () => {
      return db.orm.public.Domain.all();
    });

  test("tenant session in Tenant A successfully reads Tenant A data", async () => {
    const result = await call(tenantScopedProc, undefined, {
      context: {
        reqHeaders: reqHeaders({
          "x-menuza-tenant-id": tenantAId,
          cookie: `${TENANT_COOKIE_NAME}=${sessionAId}`,
        }),
      },
    });

    expect(result.tenantId).toBe(tenantAId);
    expect(result.role).toBe("owner");
    expect(result.domains).toHaveLength(1);
    expect(result.domains[0]).toContain(`store-a-${tenantAId.slice(0, 8)}`);
  });

  test("tenant session from Tenant A attempting to access Tenant B route returns FORBIDDEN", async () => {
    try {
      await call(tenantScopedProc, undefined, {
        context: {
          reqHeaders: reqHeaders({
            "x-menuza-tenant-id": tenantBId,
            cookie: `${TENANT_COOKIE_NAME}=${sessionAId}`,
          }),
        },
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ORPCError);
      expect(err.code).toBe("FORBIDDEN");
    }
  });

  test("cross-tenant query in procedure fails closed with TenantIsolationError", async () => {
    try {
      await call(maliciousCrossTenantProc, undefined, {
        context: {
          reqHeaders: reqHeaders({
            "x-menuza-tenant-id": tenantAId,
            cookie: `${TENANT_COOKIE_NAME}=${sessionAId}`,
          }),
        },
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(TenantIsolationError);
      expect(err.message).toContain("Cross-tenant access violation");
    }
  });

  test("querying tenant-scoped table without where.tenantId fails closed", async () => {
    try {
      await call(missingFilterProc, undefined, {
        context: {
          reqHeaders: reqHeaders({
            "x-menuza-tenant-id": tenantAId,
            cookie: `${TENANT_COOKIE_NAME}=${sessionAId}`,
          }),
        },
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(TenantIsolationError);
      expect(err.message).toContain("queried without where.tenantId");
    }
  });

  test("missing tenant header returns TENANT_NOT_RESOLVED", async () => {
    try {
      await call(tenantScopedProc, undefined, {
        context: {
          reqHeaders: reqHeaders({
            cookie: `${TENANT_COOKIE_NAME}=${sessionAId}`,
          }),
        },
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ORPCError);
      expect(err.code).toBe("TENANT_NOT_RESOLVED");
    }
  });
});
