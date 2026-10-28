/**
 * The OAuth store grant is a real boundary, not a consent-screen decoration.
 *
 * A member who belongs to two stores can still mint a token that grants only
 * one. That token must behave as if the other store does not exist: the same
 * `NOT_FOUND` an unknown slug gives, so a token cannot even probe for stores it
 * was not granted. Infrastructure-free, like the rest of the panel tests.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { ORPCError, call } from "@orpc/server";
import { db } from "@menuza/db";
import { hashOAuthToken } from "@menuza/orpc-server/auth";
import { listCouponsImpl } from "../src/domains/tenant/subdomains/panel/listCoupons.impl.ts";

const originals = {
  tenantWhere: db.orm.public.Tenant.where,
  membershipWhere: db.orm.public.TenantMembership.where,
  tokenWhere: db.orm.public.OAuthToken.where,
  couponWhere: db.orm.public.Coupon.where,
};

const MEMBER_ID = randomUUID();

const GRANTED_TENANT_ID = randomUUID();

const OTHER_TENANT_ID = randomUUID();

const RAW_TOKEN = randomUUID();

const at = (iso: string) => Temporal.PlainDateTime.from(iso);

const tenants = [
  {
    id: GRANTED_TENANT_ID,
    slug: "loja-concedida",
    displayName: "Loja Concedida",
    createdAt: at("2026-01-01 00:00"),
    updatedAt: at("2026-01-01 00:00"),
  },
  {
    id: OTHER_TENANT_ID,
    slug: "loja-nao-concedida",
    displayName: "Loja Não Concedida",
    createdAt: at("2026-01-01 00:00"),
    updatedAt: at("2026-01-01 00:00"),
  },
];

// The member belongs to BOTH stores; the token grants only one.
const memberships = tenants.map((tenant) => ({
  id: randomUUID(),
  memberId: MEMBER_ID,
  tenantId: tenant.id,
  role: "owner",
  createdAt: at("2026-01-01 00:00"),
}));

const tokens = [
  {
    id: randomUUID(),
    accessTokenHash: hashOAuthToken(RAW_TOKEN),
    refreshTokenHash: null,
    clientId: "mcp-test",
    memberId: MEMBER_ID,
    tenantIds: [GRANTED_TENANT_ID],
    scopes: ["admin"],
    expiresAt: at("2099-01-01 00:00"),
    revokedAt: null,
  },
];

function installFakes() {
  // SAFETY: Mocking Tenant.where; only `.first()` by id or slug is read here.
  db.orm.public.Tenant.where = ((filter: { id?: string; slug?: string }) => ({
    first: async () =>
      tenants.find(
        (row) =>
          (filter.id !== undefined && row.id === filter.id) ||
          (filter.slug !== undefined && row.slug === filter.slug),
      ) ?? null,
  })) as never;

  // SAFETY: Mocking TenantMembership.where; only the member/tenant pair is read.
  db.orm.public.TenantMembership.where = ((filter: { memberId?: string; tenantId?: string }) => ({
    first: async () =>
      memberships.find(
        (row) =>
          (filter.memberId === undefined || row.memberId === filter.memberId) &&
          (filter.tenantId === undefined || row.tenantId === filter.tenantId),
      ) ?? null,
  })) as never;

  // SAFETY: Mocking OAuthToken.where; only `.first()` by access token hash.
  db.orm.public.OAuthToken.where = ((filter: { accessTokenHash?: string }) => ({
    first: async () => tokens.find((row) => row.accessTokenHash === filter.accessTokenHash) ?? null,
  })) as never;

  // SAFETY: Mocking Coupon.where; the listing chains orderBy then all.
  db.orm.public.Coupon.where = (() => ({
    orderBy: () => ({ all: async () => [] }),
  })) as never;
}

function restore() {
  db.orm.public.Coupon.where = originals.couponWhere;
  db.orm.public.Tenant.where = originals.tenantWhere;
  db.orm.public.TenantMembership.where = originals.membershipWhere;
  db.orm.public.OAuthToken.where = originals.tokenWhere;
}

function bearer() {
  return new Headers({ authorization: `Bearer ${RAW_TOKEN}` });
}

async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof ORPCError ? error.code : "NOT_ORPC_ERROR";
  }

  return undefined;
}

describe("OAuth store grant — Unit (infrastructure-free)", () => {
  beforeAll(installFakes);

  afterAll(restore);

  test("a token acts on the store it was granted", async () => {
    const result = await call(
      listCouponsImpl,
      { storeSlug: "loja-concedida" },
      { context: { reqHeaders: bearer() } },
    );

    expect(result).toBeDefined();
  });

  test("a token cannot reach a store it was not granted, even as a member", async () => {
    const code = await errorCodeOf(
      call(
        listCouponsImpl,
        { storeSlug: "loja-nao-concedida" },
        { context: { reqHeaders: bearer() } },
      ),
    );

    // NOT_FOUND, not FORBIDDEN: the token must not learn the store exists.
    expect(code).toBe("NOT_FOUND");
  });

  test("an unknown bearer token is unauthorized rather than falling back to cookie auth", async () => {
    const code = await errorCodeOf(
      call(
        listCouponsImpl,
        { storeSlug: "loja-concedida" },
        { context: { reqHeaders: new Headers({ authorization: "Bearer not-a-real-token" }) } },
      ),
    );

    expect(code).toBe("UNAUTHORIZED");
  });
});
