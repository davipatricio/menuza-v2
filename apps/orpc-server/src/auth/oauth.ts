import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db as defaultDb, unscoped, type Db } from "@menuza/db";
import { hashSessionToken } from "./session.ts";

export const DEFAULT_AUTH_CODE_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * The scopes this server actually grants. `admin` is the whole grant: what a
 * token may do inside the stores it was given is decided per call by the
 * member's role and the `TENANT_CAPABILITIES` map, not by a scope string. So
 * there is nothing finer to promise — and a token claiming `orders:read` would
 * still reach `product_create` if that claim were treated as a grant, which is
 * exactly the mismatch that must not exist.
 */
export const SUPPORTED_OAUTH_SCOPES = ["admin"] as const;

export type OAuthScope = (typeof SUPPORTED_OAUTH_SCOPES)[number];

/**
 * Narrows a requested scope list to the supported set, rejecting anything else
 * rather than silently dropping it. An omitted request means `admin`.
 */
export function resolveRequestedScopes(requested: readonly string[] | undefined): OAuthScope[] {
  if (!requested || requested.length === 0) return ["admin"];

  // `isOAuthScope` is the narrowing itself: every value that reaches `accepted`
  // has been checked against the supported list, so no cast is needed after it.
  const accepted: OAuthScope[] = [];
  const unsupported: string[] = [];

  for (const scope of requested) {
    if (isOAuthScope(scope)) {
      if (!accepted.includes(scope)) accepted.push(scope);
    } else {
      unsupported.push(scope);
    }
  }

  if (unsupported.length > 0) {
    throw new Error(`Unsupported scope: ${unsupported.join(", ")}`);
  }

  return accepted;
}

/** Narrows a stored or requested scope string to the supported set. */
export function isOAuthScope(value: string): value is OAuthScope {
  return SUPPORTED_OAUTH_SCOPES.some((scope) => scope === value);
}

export const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Token hashing using SHA-256 (matches session token hashing).
 */
export function hashOAuthToken(token: string): string {
  return hashSessionToken(token);
}

/**
 * PKCE S256 verification per RFC 7636.
 * BASE64URL-ENCODE(SHA256(ASCII(code_verifier))) === code_challenge
 */
export function verifyPkce(verifier: string, codeChallenge: string, method = "S256"): boolean {
  if (method !== "S256") return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");

  return computed === codeChallenge;
}

export interface IssueAuthorizationCodeOptions {
  clientId: string;
  memberId: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  tenantIds: readonly string[];
  /** Omitted means `admin`; anything outside `SUPPORTED_OAUTH_SCOPES` is refused. */
  scopes?: readonly string[];
  redirectUri: string;
  ttlSeconds?: number;
  db?: Db;
}

export interface ExchangeAuthorizationCodeOptions {
  code: string;
  verifier: string;
  clientId: string;
  redirectUri?: string;
  ttlSeconds?: number;
  db?: Db;
}

export interface OAuthTokenResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  scopes: readonly string[];
  tenantIds: readonly string[];
}

export interface ValidatedOAuthToken {
  /** `OAuthToken.id` — what an `McpSession` row points at to be revocable. */
  tokenId: string;
  /** `SHA-256(raw token)`; the `McpSession.tokenDigest` unique key. */
  tokenDigest: string;
  memberId: string;
  tenantIds: readonly string[];
  scopes: readonly string[];
}

export async function getOAuthClient(clientId: string, options?: { db?: Db }) {
  const client = options?.db ?? defaultDb;

  return await unscoped(() => client.orm.public.OAuthClient.where({ clientId }).first());
}

/**
 * Registers a client. Explicit and deliberate: an OAuth client carries the one
 * redirect URI its codes may be delivered to, so registering one is an operator
 * action, never something a request can do for itself.
 */
export async function registerOAuthClient(options: {
  clientId: string;
  name?: string;
  redirectUris: string[];
  isPublic?: boolean;
  db?: Db;
}) {
  if (options.redirectUris.length === 0) {
    throw new Error("An OAuth client needs at least one redirect URI");
  }

  const client = options.db ?? defaultDb;

  const existing = await unscoped(() =>
    client.orm.public.OAuthClient.where({ clientId: options.clientId }).first(),
  );

  if (existing) return existing;

  await unscoped(() =>
    client.orm.public.OAuthClient.create({
      id: randomUUID(),
      clientId: options.clientId,
      name: options.name ?? options.clientId,
      redirectUris: options.redirectUris,
      isPublic: options.isPublic ?? true,
    }),
  );

  return await unscoped(() =>
    client.orm.public.OAuthClient.where({ clientId: options.clientId }).first(),
  );
}

/**
 * Resolves a client and checks the request's `redirect_uri` against the ones it
 * registered, byte for byte (RFC 6749 §3.1.2.3).
 *
 * This is the check that keeps an authorization code out of someone else's
 * hands. Registering on demand — or accepting the request's own URI — would
 * turn the consent screen into an open redirect that mails the code to the
 * attacker, so an unknown client or a mismatched URI is refused here.
 */
export async function requireOAuthClient(
  clientId: string,
  redirectUri: string,
  options?: { db?: Db },
) {
  const client = await getOAuthClient(clientId, options);

  if (!client) throw new Error("Unknown OAuth client");

  if (!client.redirectUris.includes(redirectUri)) {
    throw new Error("redirect_uri does not match a registered URI");
  }

  return client;
}

/**
 * Issues a single-use authorization code for PKCE flow with 10-minute expiry.
 */
export async function issueAuthorizationCode(
  options: IssueAuthorizationCodeOptions,
): Promise<string> {
  const client = options.db ?? defaultDb;
  const rawCode = randomBytes(32).toString("base64url");
  const codeHash = hashOAuthToken(rawCode);
  const ttl = options.ttlSeconds ?? DEFAULT_AUTH_CODE_TTL_SECONDS;
  const now = Temporal.Now.zonedDateTimeISO("UTC");
  const expiresAt = now.add({ seconds: ttl }).toPlainDateTime();

  // Refused here, at the request that asks for them: a stored scope this
  // server cannot honour must never reach a token row.
  const scopes = resolveRequestedScopes(options.scopes);

  await requireOAuthClient(options.clientId, options.redirectUri, { db: client });

  await unscoped(() =>
    client.orm.public.OAuthAuthCode.create({
      id: randomUUID(),
      codeHash,
      clientId: options.clientId,
      memberId: options.memberId,
      codeChallenge: options.codeChallenge,
      codeChallengeMethod: options.codeChallengeMethod ?? "S256",
      tenantIds: [...options.tenantIds],
      scopes,
      redirectUri: options.redirectUri,
      expiresAt,
    }),
  );

  return rawCode;
}

/**
 * Exchanges single-use authorization code for a 30-day bearer access token with PKCE verification.
 */
export async function exchangeAuthorizationCode(
  options: ExchangeAuthorizationCodeOptions,
): Promise<OAuthTokenResult> {
  const client = options.db ?? defaultDb;
  const codeHash = hashOAuthToken(options.code);

  const authCode = await unscoped(() =>
    client.orm.public.OAuthAuthCode.where({ codeHash }).first(),
  );

  if (!authCode) {
    throw new Error("Invalid or expired authorization code");
  }

  // Validate before consuming: a wrong-verifier attempt must not burn the
  // code, or a single typo would force the user through consent again.
  if (authCode.clientId !== options.clientId) {
    throw new Error("Client ID mismatch");
  }

  if (options.redirectUri && authCode.redirectUri !== options.redirectUri) {
    throw new Error("Redirect URI mismatch");
  }

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  if (Temporal.PlainDateTime.compare(authCode.expiresAt, now) <= 0) {
    throw new Error("Authorization code expired");
  }

  if (!verifyPkce(options.verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
    throw new Error("Invalid PKCE code_verifier");
  }

  // Consume the code atomically and stop unless this request was the one that
  // removed it. A read-then-delete would let two overlapping exchanges both
  // pass the checks above and each mint a token from one supposedly
  // single-use code; the row count is the compare-and-swap.
  const consumed = await unscoped(() =>
    client.orm.public.OAuthAuthCode.where({ id: authCode.id }).deleteAndCount(),
  );

  if (consumed !== 1) {
    throw new Error("Authorization code already used");
  }

  const rawAccessToken = randomBytes(32).toString("base64url");
  const accessTokenHash = hashOAuthToken(rawAccessToken);
  const ttl = options.ttlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS;

  const tokenExpiresAt = Temporal.Now.zonedDateTimeISO("UTC")
    .add({ seconds: ttl })
    .toPlainDateTime();

  await unscoped(() =>
    client.orm.public.OAuthToken.create({
      id: randomUUID(),
      accessTokenHash,
      clientId: authCode.clientId,
      memberId: authCode.memberId,
      tenantIds: [...authCode.tenantIds],
      scopes: [...authCode.scopes],
      expiresAt: tokenExpiresAt,
    }),
  );

  return {
    accessToken: rawAccessToken,
    tokenType: "Bearer",
    expiresIn: ttl,
    scopes: authCode.scopes,
    tenantIds: authCode.tenantIds,
  };
}

/**
 * Validates raw bearer OAuth token, checking expiration and revocation.
 */
export async function validateOAuthToken(
  rawToken: string,
  options?: { db?: Db },
): Promise<ValidatedOAuthToken | null> {
  const client = options?.db ?? defaultDb;
  const accessTokenHash = hashOAuthToken(rawToken);

  const token = await unscoped(() =>
    client.orm.public.OAuthToken.where({ accessTokenHash }).first(),
  );

  if (!token) return null;

  if (token.revokedAt) return null;

  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  if (Temporal.PlainDateTime.compare(token.expiresAt, now) <= 0) {
    return null;
  }

  return {
    tokenId: token.id,
    tokenDigest: accessTokenHash,
    memberId: token.memberId,
    tenantIds: token.tenantIds,
    scopes: token.scopes,
  };
}

/**
 * Revokes an OAuth token by its raw token value.
 */
export async function revokeOAuthToken(rawToken: string, options?: { db?: Db }): Promise<boolean> {
  const client = options?.db ?? defaultDb;
  const accessTokenHash = hashOAuthToken(rawToken);
  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  const res = await unscoped(() =>
    client.orm.public.OAuthToken.where({ accessTokenHash }).updateAll({
      revokedAt: now,
    }),
  );

  return Array.isArray(res) ? res.length > 0 : Boolean(res);
}

/**
 * RFC 8414 Authorization Server Metadata.
 */
export function getOAuthServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    grant_types_supported: ["authorization_code"],
    scopes_supported: [...SUPPORTED_OAUTH_SCOPES],
  };
}
