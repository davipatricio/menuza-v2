/* eslint-disable anti-slop/no-chained-type-assertions */
import { describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@menuza/db";
import {
  exchangeAuthorizationCode,
  getOAuthServerMetadata,
  issueAuthorizationCode,
  resolveRequestedScopes,
  revokeOAuthToken,
  validateOAuthToken,
  verifyPkce,
} from "../src/auth/index.ts";

interface FakeClientRow {
  id: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  isPublic: boolean;
}

interface FakeAuthCodeRow {
  id: string;
  codeHash: string;
  clientId: string;
  memberId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  tenantIds: string[];
  scopes: string[];
  redirectUri: string;
  expiresAt: Temporal.PlainDateTime;
}

interface FakeTokenRow {
  id: string;
  accessTokenHash: string;
  refreshTokenHash: string | null;
  clientId: string;
  memberId: string;
  tenantIds: string[];
  scopes: string[];
  expiresAt: Temporal.PlainDateTime;
  revokedAt: Temporal.PlainDateTime | null;
}

function createOAuthDb(options?: { clientId?: string; redirectUris?: string[] }) {
  const clients: FakeClientRow[] = [
    {
      id: "client-row",
      clientId: options?.clientId ?? "test-client",
      name: "Test Client",
      redirectUris: options?.redirectUris ?? ["http://localhost:8080/callback"],
      isPublic: true,
    },
  ];

  const authCodes: FakeAuthCodeRow[] = [];
  const tokens: FakeTokenRow[] = [];

  const fake = {
    orm: {
      public: {
        OAuthClient: {
          where: (filter: { clientId: string }) => ({
            first: async () => clients.find((c) => c.clientId === filter.clientId) ?? null,
          }),
          create: async (data: FakeClientRow) => {
            clients.push(data);
          },
        },
        OAuthAuthCode: {
          where: (filter: { id?: string; codeHash?: string }) => ({
            first: async () =>
              authCodes.find(
                (c) =>
                  (filter.id ? c.id === filter.id : true) &&
                  (filter.codeHash ? c.codeHash === filter.codeHash : true),
              ) ?? null,
            // Mirrors the real terminal: the count IS the compare-and-swap.
            deleteAndCount: async () => {
              const idx = authCodes.findIndex(
                (c) =>
                  (filter.id ? c.id === filter.id : true) &&
                  (filter.codeHash ? c.codeHash === filter.codeHash : true),
              );

              if (idx === -1) return 0;

              authCodes.splice(idx, 1);

              return 1;
            },
          }),
          create: async (data: FakeAuthCodeRow) => {
            authCodes.push(data);
          },
        },
        OAuthToken: {
          where: (filter: { accessTokenHash: string }) => ({
            first: async () =>
              tokens.find((t) => t.accessTokenHash === filter.accessTokenHash) ?? null,
            updateAll: async (data: { revokedAt?: Temporal.PlainDateTime | null }) => {
              let count = 0;

              for (const t of tokens) {
                if (t.accessTokenHash === filter.accessTokenHash) {
                  if (data.revokedAt !== undefined) t.revokedAt = data.revokedAt;
                  count++;
                }
              }

              return { count };
            },
          }),
          create: async (data: FakeTokenRow) => {
            tokens.push({ ...data, refreshTokenHash: null, revokedAt: null });
          },
        },
      },
    },
  };

  // SAFETY: the fake implements only the OAuth surface these tests read; the real Db type is wider.
  return { db: fake as unknown as Db, clients, authCodes, tokens };
}

describe("OAuth 2.1 PKCE Flow — Unit", () => {
  test("verifyPkce verifies S256 code challenge correctly", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = createHash("sha256").update(verifier).digest("base64url");

    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
    expect(verifyPkce("wrong-verifier", challenge, "S256")).toBe(false);
    expect(verifyPkce(verifier, challenge, "plain")).toBe(false);
  });

  test("issueAuthorizationCode stores hashed code with 10min expiry", async () => {
    const { db, authCodes } = createOAuthDb();
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

    const code = await issueAuthorizationCode({
      clientId: "test-client",
      memberId: "member-123",
      codeChallenge,
      tenantIds: ["tenant-abc"],
      scopes: ["admin"],
      redirectUri: "http://localhost:8080/callback",
      db,
    });

    expect(code).toBeDefined();
    expect(authCodes).toHaveLength(1);
    expect(authCodes[0]!.clientId).toBe("test-client");
    expect(authCodes[0]!.memberId).toBe("member-123");
    expect(authCodes[0]!.codeChallenge).toBe(codeChallenge);
    expect(authCodes[0]!.tenantIds).toEqual(["tenant-abc"]);
  });

  test("exchangeAuthorizationCode completes PKCE exchange and consumes code", async () => {
    const { db, authCodes, tokens } = createOAuthDb();
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

    const code = await issueAuthorizationCode({
      clientId: "test-client",
      memberId: "member-123",
      codeChallenge,
      tenantIds: ["tenant-abc"],
      scopes: ["admin"],
      redirectUri: "http://localhost:8080/callback",
      db,
    });

    const tokenResult = await exchangeAuthorizationCode({
      code,
      verifier,
      clientId: "test-client",
      redirectUri: "http://localhost:8080/callback",
      db,
    });

    expect(tokenResult.accessToken).toBeDefined();
    expect(tokenResult.tokenType).toBe("Bearer");
    expect(tokenResult.expiresIn).toBe(30 * 24 * 60 * 60);
    expect(tokenResult.scopes).toEqual(["admin"]);
    expect(tokenResult.tenantIds).toEqual(["tenant-abc"]);

    // Auth code must be deleted (single use)
    expect(authCodes).toHaveLength(0);
    expect(tokens).toHaveLength(1);

    // Attempting to reuse code fails
    await expect(
      exchangeAuthorizationCode({
        code,
        verifier,
        clientId: "test-client",
        db,
      }),
    ).rejects.toThrow("Invalid or expired authorization code");
  });

  test("exchangeAuthorizationCode rejects invalid verifier", async () => {
    const { db } = createOAuthDb();
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

    const code = await issueAuthorizationCode({
      clientId: "test-client",
      memberId: "member-123",
      codeChallenge,
      tenantIds: ["tenant-abc"],
      scopes: ["admin"],
      redirectUri: "http://localhost:8080/callback",
      db,
    });

    await expect(
      exchangeAuthorizationCode({
        code,
        verifier: "wrong-verifier",
        clientId: "test-client",
        db,
      }),
    ).rejects.toThrow("Invalid PKCE code_verifier");
  });

  test("a wrong verifier does not burn the code", async () => {
    const { db, authCodes } = createOAuthDb();
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

    const code = await issueAuthorizationCode({
      clientId: "test-client",
      memberId: "member-123",
      codeChallenge,
      tenantIds: ["tenant-abc"],
      scopes: ["admin"],
      redirectUri: "http://localhost:8080/callback",
      db,
    });

    await expect(
      exchangeAuthorizationCode({ code, verifier: "wrong", clientId: "test-client", db }),
    ).rejects.toThrow("Invalid PKCE code_verifier");

    // Validation runs before consumption, so the real client can still redeem.
    expect(authCodes).toHaveLength(1);

    const result = await exchangeAuthorizationCode({
      code,
      verifier,
      clientId: "test-client",
      db,
    });

    expect(result.accessToken).toBeDefined();
  });

  test("concurrent exchanges of one code mint exactly one token", async () => {
    const { db, tokens } = createOAuthDb();
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

    const code = await issueAuthorizationCode({
      clientId: "test-client",
      memberId: "member-123",
      codeChallenge,
      tenantIds: ["tenant-abc"],
      scopes: ["admin"],
      redirectUri: "http://localhost:8080/callback",
      db,
    });

    // Both requests read the row before either deletes it; only the delete that
    // removes the row may proceed, so one of them must fail.
    const results = await Promise.allSettled([
      exchangeAuthorizationCode({ code, verifier, clientId: "test-client", db }),
      exchangeAuthorizationCode({ code, verifier, clientId: "test-client", db }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(fulfilled).toHaveLength(1);
    expect(tokens).toHaveLength(1);
  });

  test("validateOAuthToken validates active token, ignores revoked or expired", async () => {
    const { db } = createOAuthDb();
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

    const code = await issueAuthorizationCode({
      clientId: "test-client",
      memberId: "member-123",
      codeChallenge,
      tenantIds: ["tenant-abc", "tenant-xyz"],
      scopes: ["admin"],
      redirectUri: "http://localhost:8080/callback",
      db,
    });

    const { accessToken } = await exchangeAuthorizationCode({
      code,
      verifier,
      clientId: "test-client",
      db,
    });

    const validated = await validateOAuthToken(accessToken, { db });
    expect(validated).not.toBeNull();
    expect(validated?.memberId).toBe("member-123");
    expect(validated?.tenantIds).toEqual(["tenant-abc", "tenant-xyz"]);
    expect(validated?.scopes).toEqual(["admin"]);

    // Revocation
    await revokeOAuthToken(accessToken, { db });
    const afterRevoke = await validateOAuthToken(accessToken, { db });
    expect(afterRevoke).toBeNull();
  });

  test("a scope this server cannot enforce is refused, not stored", async () => {
    const { db, authCodes, tokens } = createOAuthDb();
    const verifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

    // `orders:read` is a capability name, not a scope: storing it would imply a
    // narrowing the panel never applies, so a token could still write.
    await expect(
      issueAuthorizationCode({
        clientId: "test-client",
        memberId: "member-123",
        codeChallenge,
        tenantIds: ["tenant-abc"],
        scopes: ["orders:read"],
        redirectUri: "http://localhost:8080/callback",
        db,
      }),
    ).rejects.toThrow("Unsupported scope: orders:read");

    expect(authCodes).toHaveLength(0);
    expect(tokens).toHaveLength(0);
  });

  test("an omitted scope list resolves to admin", async () => {
    expect(resolveRequestedScopes(undefined)).toEqual(["admin"]);
    expect(resolveRequestedScopes([])).toEqual(["admin"]);
    expect(resolveRequestedScopes(["admin"])).toEqual(["admin"]);
  });

  test("an unregistered client cannot start a flow", async () => {
    const { db } = createOAuthDb();

    await expect(
      issueAuthorizationCode({
        clientId: "not-registered",
        memberId: "member-123",
        codeChallenge: "challenge",
        tenantIds: ["tenant-abc"],
        scopes: ["admin"],
        redirectUri: "http://localhost:8080/callback",
        db,
      }),
    ).rejects.toThrow("Unknown OAuth client");
  });

  test("a redirect URI the client did not register is refused", async () => {
    const { db } = createOAuthDb();

    await expect(
      issueAuthorizationCode({
        clientId: "test-client",
        memberId: "member-123",
        codeChallenge: "challenge",
        tenantIds: ["tenant-abc"],
        scopes: ["admin"],
        // Same client, attacker-controlled URI: the code must never go here.
        redirectUri: "https://evil.example/callback",
        db,
      }),
    ).rejects.toThrow("redirect_uri does not match a registered URI");
  });

  test("getOAuthServerMetadata matches RFC 8414 metadata spec", () => {
    const meta = getOAuthServerMetadata("https://api.menuza.com");
    expect(meta.issuer).toBe("https://api.menuza.com");
    expect(meta.authorization_endpoint).toBe("https://api.menuza.com/oauth/authorize");
    expect(meta.token_endpoint).toBe("https://api.menuza.com/oauth/token");
    expect(meta.revocation_endpoint).toBe("https://api.menuza.com/oauth/revoke");
    expect(meta.response_types_supported).toEqual(["code"]);
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
});
