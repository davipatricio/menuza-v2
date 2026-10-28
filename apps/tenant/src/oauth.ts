import * as v from "valibot";
import { db, unscoped } from "@menuza/db";
import {
  exchangeAuthorizationCode,
  getCookieName,
  getOAuthServerMetadata,
  getSession,
  issueAuthorizationCode,
  parseCookies,
  revokeOAuthToken,
} from "@menuza/orpc-server/auth";

const TokenRequestSchema = v.object({
  grant_type: v.string(),
  code: v.optional(v.string()),
  code_verifier: v.optional(v.string()),
  client_id: v.optional(v.string()),
  redirect_uri: v.optional(v.string()),
});

type TokenRequest = v.InferOutput<typeof TokenRequestSchema>;

const AuthorizeRequestSchema = v.object({
  clientId: v.string(),
  redirectUri: v.string(),
  codeChallenge: v.string(),
  codeChallengeMethod: v.optional(v.string()),
  tenantIds: v.optional(v.array(v.string())),
  scopes: v.optional(v.array(v.string())),
});

type AuthorizeRequest = v.InferOutput<typeof AuthorizeRequestSchema>;

const RevokeRequestSchema = v.object({
  token: v.optional(v.string()),
});

type RevokeRequest = v.InferOutput<typeof RevokeRequestSchema>;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
} as const;

function corsOptionsResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function handleMetadata(url: URL): Response {
  const origin = url.origin;
  const metadata = getOAuthServerMetadata(origin);

  return Response.json(metadata, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

async function parseTokenBody(req: Request): Promise<TokenRequest | null> {
  const contentType = req.headers.get("content-type") ?? "";

  const raw: unknown = contentType.includes("application/json")
    ? await req.json().catch(() => null)
    : Object.fromEntries((await req.formData()).entries());

  const parsed = v.safeParse(TokenRequestSchema, raw);

  return parsed.success ? parsed.output : null;
}

async function handleToken(req: Request): Promise<Response> {
  const params = await parseTokenBody(req);

  if (!params) {
    return Response.json(
      {
        error: "invalid_request",
        error_description: "Invalid request payload",
      },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      },
    );
  }

  if (params.grant_type !== "authorization_code") {
    return Response.json(
      {
        error: "unsupported_grant_type",
        error_description: "Only grant_type=authorization_code is supported",
      },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      },
    );
  }

  if (!params.code || !params.code_verifier || !params.client_id) {
    return Response.json(
      {
        error: "invalid_request",
        error_description: "code, code_verifier, and client_id are required",
      },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      },
    );
  }

  try {
    const tokenResult = await exchangeAuthorizationCode({
      code: params.code,
      verifier: params.code_verifier,
      clientId: params.client_id,
      redirectUri: params.redirect_uri,
    });

    return Response.json(
      {
        access_token: tokenResult.accessToken,
        token_type: tokenResult.tokenType,
        expires_in: tokenResult.expiresIn,
        scope: tokenResult.scopes.join(" "),
        tenant_ids: tokenResult.tenantIds,
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";

    return Response.json(
      { error: "invalid_grant", error_description: message },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" },
      },
    );
  }
}

async function parseAuthorizeBody(req: Request): Promise<AuthorizeRequest | null> {
  const raw: unknown = await req.json().catch(() => null);
  const parsed = v.safeParse(AuthorizeRequestSchema, raw);

  return parsed.success ? parsed.output : null;
}

async function handleAuthorize(req: Request): Promise<Response> {
  const cookieHeader = req.headers.get("cookie");
  const cookie = parseCookies(cookieHeader)[getCookieName("tenant")];

  if (!cookie) {
    return Response.json(
      { error: "unauthorized", error_description: "Missing session cookie" },
      { status: 401 },
    );
  }

  const session = await getSession(cookie);

  if (!session || session.namespace !== "tenant") {
    return Response.json(
      { error: "unauthorized", error_description: "Invalid or expired session" },
      { status: 401 },
    );
  }

  const params = await parseAuthorizeBody(req);

  if (!params) {
    return Response.json(
      { error: "invalid_request", error_description: "Missing or invalid required fields" },
      { status: 400 },
    );
  }

  // Verify member has access to the requested stores
  const requestedTenantIds = params.tenantIds ?? [];

  const memberMemberships = await unscoped(() =>
    db.orm.public.TenantMembership.where({ memberId: session.memberId }).all(),
  );

  const allowedTenantIds = new Set(memberMemberships.map((m) => m.tenantId));
  const validTenantIds = requestedTenantIds.filter((id) => allowedTenantIds.has(id));

  const code = await issueAuthorizationCode({
    clientId: params.clientId,
    memberId: session.memberId,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    tenantIds: validTenantIds,
    scopes: params.scopes && params.scopes.length > 0 ? params.scopes : ["admin"],
    redirectUri: params.redirectUri,
  });

  return Response.json({
    code,
    redirectUri: params.redirectUri,
  });
}

async function parseRevokeBody(req: Request): Promise<RevokeRequest | null> {
  const contentType = req.headers.get("content-type") ?? "";

  const raw: unknown = contentType.includes("application/json")
    ? await req.json().catch(() => null)
    : Object.fromEntries((await req.formData()).entries());

  const parsed = v.safeParse(RevokeRequestSchema, raw);

  return parsed.success ? parsed.output : null;
}

async function handleRevoke(req: Request): Promise<Response> {
  const params = await parseRevokeBody(req);

  if (params?.token) {
    await revokeOAuthToken(params.token);
  }

  return new Response(null, {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

export async function handleOAuthRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);

  if (url.pathname === "/.well-known/oauth-authorization-server") {
    if (req.method === "OPTIONS") return corsOptionsResponse();

    return handleMetadata(url);
  }

  if (url.pathname === "/oauth/token") {
    if (req.method === "OPTIONS") return corsOptionsResponse();

    if (req.method !== "POST") return new Response(null, { status: 405 });

    return await handleToken(req);
  }

  if (url.pathname === "/oauth/authorize" && req.method === "POST") {
    return await handleAuthorize(req);
  }

  if (url.pathname === "/oauth/revoke") {
    if (req.method === "OPTIONS") return corsOptionsResponse();

    if (req.method === "POST") return await handleRevoke(req);
  }

  return null;
}
