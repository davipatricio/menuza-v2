import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { call, ORPCError, os } from "@orpc/server";
import { db, unscoped } from "@menuza/db";
import { tenantMiddleware } from "@menuza/tenant-context";
import {
  authMiddleware,
  clearMembershipCache,
  COMMERCE_COOKIE_NAME,
  createSession,
  getCachedMembership,
  hashPassword,
  invalidateMembershipCache,
  parseCookies,
  revokeSession,
  serializeClearSessionCookie,
  serializeSessionCookie,
  TENANT_COOKIE_NAME,
  verifyPassword,
} from "../src/index.ts";

function reqHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers(headers);
}

describe("@menuza/auth-core — Unit (infrastructure-free)", () => {
  describe("Password hashing (Argon2id)", () => {
    test("hash and verify roundtrip succeeds", async () => {
      const hash = await hashPassword("my-super-password");
      expect(hash).toContain("$argon2id$");

      const match = await verifyPassword("my-super-password", hash);
      expect(match).toBe(true);

      const wrongMatch = await verifyPassword("wrong-password", hash);
      expect(wrongMatch).toBe(false);
    });
  });

  describe("Cookie serialization and parsing", () => {
    test("serializes and parses session cookie correctly", () => {
      const serialized = serializeSessionCookie("tenant", "sess-123");
      expect(serialized).toContain("menuza_tenant_sid=sess-123");
      expect(serialized).toContain("HttpOnly");
      expect(serialized).toContain("Secure");
      expect(serialized).toContain("SameSite=Lax");

      const parsed = parseCookies(serialized);
      expect(parsed[TENANT_COOKIE_NAME]).toBe("sess-123");
    });

    test("serializes clear session cookie", () => {
      const clearCookie = serializeClearSessionCookie("commerce");
      expect(clearCookie).toContain("menuza_commerce_sid=");
      expect(clearCookie).toContain("Max-Age=0");
    });

    test("malformed percent-encoding does not throw URIError", () => {
      const parsed = parseCookies("unrelated=%; valid=ok");
      expect(parsed.valid).toBe("ok");
      expect(parsed.unrelated).toBe("%");
    });
  });
});

describe.skipIf(!process.env.TEST_INTEGRATION)(
  "@menuza/auth-core — Integration (DB-backed)",
  () => {
    const memberId = randomUUID();
    const tenant1Id = randomUUID();
    const tenant2Id = randomUUID();

    beforeAll(async () => {
      // Create member
      const passwordHash = await hashPassword("password123");
      await db.orm.public.Member.create({
        id: memberId,
        email: `auth-test-${memberId.slice(0, 8)}@menuza.local`,
        passwordHash,
        updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
      });

      // Create two tenants
      await db.orm.public.Tenant.create({
        id: tenant1Id,
        slug: `tenant-auth-1-${tenant1Id.slice(0, 8)}`,
        displayName: "Tenant Auth 1",
        updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
      });

      await db.orm.public.Tenant.create({
        id: tenant2Id,
        slug: `tenant-auth-2-${tenant2Id.slice(0, 8)}`,
        displayName: "Tenant Auth 2",
        updatedAt: Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime(),
      });

      // Create membership only for tenant1 (role: Admin)
      await db.orm.public.TenantMembership.create({
        id: randomUUID(),
        memberId,
        tenantId: tenant1Id,
        role: "Admin",
      });
    });

    afterAll(async () => {
      await unscoped(async () => {
        await db.orm.public.TenantMembership.where({ memberId }).deleteAll();
        await db.orm.public.Session.where({ memberId }).deleteAll();
        await db.orm.public.Member.where({ id: memberId }).deleteAll();
        await db.orm.public.Tenant.where({ id: tenant1Id }).deleteAll();
        await db.orm.public.Tenant.where({ id: tenant2Id }).deleteAll();
      });
    });

    describe("Auth Middleware — Tenant namespace", () => {
      test("valid tenant session with membership succeeds and populates context", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({
            session: context.session,
          }));

        const result = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              "x-menuza-tenant-id": tenant1Id,
              cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(result.session.sessionId).toBe(sessionId);
        expect(result.session.memberId).toBe(memberId);
        expect(result.session.tenantId).toBe(tenant1Id);
        expect(result.session.role).toBe("Admin");
      });

      test("tenant session without cookie throws UNAUTHORIZED", async () => {
        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });

      test("expired session throws UNAUTHORIZED", async () => {
        // Create an expired session in DB directly
        const sessionId = randomUUID();

        const expiredTime = Temporal.Now.zonedDateTimeISO("UTC")
          .subtract({ minutes: 5 })
          .toPlainDateTime();

        await db.orm.public.Session.create({
          id: sessionId,
          memberId,
          namespace: "tenant",
          expiresAt: expiredTime,
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });

      test("revoked session throws UNAUTHORIZED", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        await revokeSession(sessionId);

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });

      test("member without membership in tenant throws FORBIDDEN", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        // Requesting tenant2Id where member has no membership
        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant2Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("FORBIDDEN");
        }
      });

      test("commerce session hitting tenant route throws UNAUTHORIZED (namespace isolation)", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "commerce",
        });

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        try {
          await call(proc, undefined, {
            context: {
              reqHeaders: reqHeaders({
                "x-menuza-tenant-id": tenant1Id,
                cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
              }),
            },
          });
          expect.unreachable();
        } catch (err: any) {
          expect(err).toBeInstanceOf(ORPCError);
          expect(err.code).toBe("UNAUTHORIZED");
        }
      });
    });

    describe("Auth Middleware — Commerce namespace", () => {
      test("valid commerce session succeeds and populates context", async () => {
        const { id: sessionId } = await createSession({
          memberId,
          namespace: "commerce",
        });

        const proc = os
          .use(authMiddleware({ namespace: "commerce" }))
          .handler(({ context }) => ({ session: context.session }));

        const result = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              cookie: `${COMMERCE_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(result.session.sessionId).toBe(sessionId);
        expect(result.session.memberId).toBe(memberId);
      });
    });

    describe("Membership cache", () => {
      test("caches memberships per tenant and does not lock out second tenant", async () => {
        // Add membership for tenant2 as well
        const membership2Id = randomUUID();
        await db.orm.public.TenantMembership.create({
          id: membership2Id,
          memberId,
          tenantId: tenant2Id,
          role: "Editor",
        });

        const { id: sessionId } = await createSession({
          memberId,
          namespace: "tenant",
        });

        clearMembershipCache();
        expect(getCachedMembership(sessionId, tenant1Id)).toBeNull();

        const proc = os
          .use(tenantMiddleware({ require: "tenant" }))
          .use(authMiddleware({ namespace: "tenant" }))
          .handler(({ context }) => ({ session: context.session }));

        // Access tenant1
        const res1 = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              "x-menuza-tenant-id": tenant1Id,
              cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(res1.session.tenantId).toBe(tenant1Id);
        expect(getCachedMembership(sessionId, tenant1Id)?.role).toBe("Admin");

        // Access tenant2 on same session — must NOT fail with null cache hit
        const res2 = await call(proc, undefined, {
          context: {
            reqHeaders: reqHeaders({
              "x-menuza-tenant-id": tenant2Id,
              cookie: `${TENANT_COOKIE_NAME}=${sessionId}`,
            }),
          },
        });

        expect(res2.session.tenantId).toBe(tenant2Id);
        expect(getCachedMembership(sessionId, tenant2Id)?.role).toBe("Editor");

        // Invalidate evicts all tenants for this session
        invalidateMembershipCache(sessionId);
        expect(getCachedMembership(sessionId, tenant1Id)).toBeNull();
        expect(getCachedMembership(sessionId, tenant2Id)).toBeNull();

        // Clean up membership2
        await db.orm.public.TenantMembership.where({
          id: membership2Id,
          tenantId: tenant2Id,
        }).deleteAll();
      });
    });
  },
);
