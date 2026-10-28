/**
 * The admin MCP endpoint.
 *
 * Stateless Streamable HTTP: one fresh `McpServer` + transport per request,
 * bound to the bearer token that arrived with it. Statelessness is deliberate —
 * a session id would have to be mapped to a member and grant server-side, and
 * the token already carries both, so a per-request server is the whole state.
 *
 * Authentication happens here, once: the bearer token resolves to a member and
 * a store grant, and every tool call then reaches the panel procedures through
 * the same `Authorization` header. Those procedures re-validate the token on
 * their own, so this handler adds no authority of its own.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { call } from "@orpc/server";
import { db, unscoped } from "@menuza/db";
import { validateOAuthToken } from "@menuza/orpc-server/auth";
import { canonicalRole } from "@menuza/api-tenant";
import { toolsFor, type ToolDefinition } from "./tools.ts";

export const MCP_PATH = "/mcp";

/** The token behind one MCP request, narrowed to what the handler needs. */
interface CallerGrant {
  readonly memberId: string;
  /** `null` for an unrestricted cookie session; always a list for a token. */
  readonly tenantIds: readonly string[] | null;
  /** `OAuthToken.id` and its digest, for recording the session row. */
  readonly tokenId: string;
  readonly tokenDigest: string;
}

function unauthorized(): Response {
  return Response.json(
    { error: "invalid_token", error_description: "Bearer token ausente ou inválido." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}

async function grantFor(authorization: string | null): Promise<CallerGrant | null> {
  const header = authorization?.trim() ?? "";
  const [scheme, ...rest] = header.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || rest.length === 0) return null;

  const token = await validateOAuthToken(rest.join(" "));

  if (!token) return null;

  return {
    memberId: token.memberId,
    tenantIds: token.tenantIds,
    tokenId: token.tokenId,
    tokenDigest: token.tokenDigest,
  };
}

/** Roles the member holds in the stores this grant covers. */
async function rolesFor(grant: CallerGrant): Promise<string[]> {
  const rows = await unscoped(() =>
    db.orm.public.TenantMembership.where({ memberId: grant.memberId }).all(),
  );

  return rows
    .filter((row) => grant.tenantIds === null || grant.tenantIds.includes(row.tenantId))
    .map((row) => canonicalRole(row.role));
}

/** Slugs of the stores this grant covers, newest membership order preserved. */
async function slugsFor(grant: CallerGrant): Promise<string[]> {
  const rows = await unscoped(() =>
    db.orm.public.TenantMembership.where({ memberId: grant.memberId }).all(),
  );

  const tenants = await unscoped(() =>
    Promise.all(rows.map((row) => db.orm.public.Tenant.where({ id: row.tenantId }).first())),
  );

  return rows.flatMap((row, index) => {
    const tenant = tenants[index];

    if (!tenant || (grant.tenantIds !== null && !grant.tenantIds.includes(tenant.id))) return [];

    return [tenant.slug];
  });
}

/**
 * The single authorized store of a grant, or `null` when it covers zero or
 * several. Only a one-store grant lets a tool omit `storeSlug`.
 */
async function singleStoreSlug(grant: CallerGrant): Promise<string | null> {
  const slugs = await slugsFor(grant);

  return slugs.length === 1 ? (slugs[0] ?? null) : null;
}

/** The store ids this grant covers, intersected with the member's own memberships. */
async function grantedTenantIds(grant: CallerGrant): Promise<string[]> {
  const rows = await unscoped(() =>
    db.orm.public.TenantMembership.where({ memberId: grant.memberId }).all(),
  );

  return rows
    .map((row) => row.tenantId)
    .filter((tenantId) => grant.tenantIds === null || grant.tenantIds.includes(tenantId));
}

/**
 * Whether the integration is switched on for this store.
 *
 * The dashboard's switch is the publish control: a store that has not enabled
 * the MCP integration must not serve tools, even to a member holding a valid
 * token — the token proves who they are, the switch proves the store agreed.
 * A store with no row has never enabled it.
 */
async function integrationEnabled(tenantId: string): Promise<boolean> {
  const row = await unscoped(() =>
    db.orm.public.StoreIntegration.where({
      tenantId,
      integrationId: "mcp-dashboard",
    }).first(),
  );

  return row?.status === "enabled";
}

/**
 * Records (or refreshes) the `McpSession` row for this token on this store.
 *
 * The row is what the dashboard lists and revokes, so it is created the first
 * time a token is used and its `lastUsedAt` slides afterwards. Keyed by the
 * token digest, so one token maps to one row no matter how many tools it calls:
 * a row per request would make the sessions list unusable.
 */
async function touchSession(grant: CallerGrant, tenantId: string, clientName: string) {
  const now = Temporal.Now.zonedDateTimeISO("UTC").toPlainDateTime();

  const existing = await unscoped(() =>
    db.orm.public.McpSession.where({ tokenDigest: grant.tokenDigest }).first(),
  );

  if (existing) {
    await unscoped(() =>
      db.orm.public.McpSession.where({ id: existing.id }).updateAll({ lastUsedAt: now }),
    );

    return;
  }

  await unscoped(() =>
    db.orm.public.McpSession.create({
      id: crypto.randomUUID(),
      tenantId,
      memberId: grant.memberId,
      integrationId: "mcp-dashboard",
      label: `${clientName} — ${now.toPlainDate().toString()}`,
      clientName,
      oauthTokenId: grant.tokenId,
      tokenDigest: grant.tokenDigest,
      lastUsedAt: now,
      createdAt: now,
    }),
  );
}

/** The `initialize` client name, or a stable fallback when a client omits it. */
function clientNameOf(req: Request): string {
  const raw = req.headers.get("x-menuza-mcp-client")?.trim();

  return raw && raw.length <= 60 ? raw : "Cliente MCP";
}

/** A tool's JSON payload, already serialized at the boundary by `JSON.stringify`. */
type ToolText = string;

function textResult(text: ToolText, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

/**
 * Arguments a tool call carries, taken from the SDK's own request type rather
 * than restated here — the protocol owns that shape.
 */
type ToolArgs = NonNullable<CallToolRequest["params"]["arguments"]>;

/**
 * Runs one tool by delegating to its panel procedure. The forwarded header is
 * the token the client already sent, so the procedure authenticates and
 * authorizes exactly as it does for a dashboard request.
 */
async function runTool(
  tool: ToolDefinition,
  args: ToolArgs,
  authorization: string,
  defaultSlug: string | null,
) {
  const input = defaultSlug ? { storeSlug: defaultSlug, ...args } : args;

  // SAFETY: `call` validates the input against the procedure's own Valibot
  // schema, which is where a malformed argument becomes a typed error. The
  // tools map was built from these same procedures, so the pairing is fixed;
  // only the heterogeneous router union stops TypeScript seeing it.
  const output = await call(tool.impl, input as never, {
    context: {
      reqHeaders: new Headers({ authorization }),
    } as never,
  });

  return textResult(JSON.stringify(output, null, 2));
}

function buildServer(
  tools: ReturnType<typeof toolsFor>,
  authorization: string,
  defaultSlug: string | null,
) {
  const server = new Server(
    { name: "menuza-admin", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: tools.tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.byName.get(request.params.name);

    if (!tool) return textResult(`Ferramenta desconhecida: ${request.params.name}`, true);

    // SAFETY: the SDK types `arguments` as an open record; the procedure's own
    // Valibot schema is what narrows it, and it rejects anything else.
    const args = (request.params.arguments ?? {}) as ToolArgs;

    try {
      return await runTool(tool, args, authorization, defaultSlug);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao executar a ferramenta.";

      return textResult(message, true);
    }
  });

  return server;
}

/**
 * Handles `POST /mcp` (and `GET`/`DELETE` on the same path). Returns `null` for
 * any other path so the caller keeps routing.
 */
export async function handleMcpRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);

  if (url.pathname !== MCP_PATH) return null;

  const authorization = req.headers.get("authorization");
  const grant = await grantFor(authorization);

  if (!grant || !authorization) return unauthorized();

  const tenantIds = await grantedTenantIds(grant);

  // Only the stores that switched the integration on serve tools. A token
  // granted two stores gets the one that agreed, not both.
  const enabled = await Promise.all(tenantIds.map((tenantId) => integrationEnabled(tenantId)));
  const allowedTenantIds = tenantIds.filter((_, index) => enabled[index]);

  if (allowedTenantIds.length === 0) {
    return Response.json(
      {
        error: "integration_disabled",
        error_description: "A integração MCP não está ativada nesta loja.",
      },
      { status: 403 },
    );
  }

  for (const tenantId of allowedTenantIds) {
    await touchSession(grant, tenantId, clientNameOf(req));
  }

  const defaultSlug = await singleStoreSlug(grant);
  const tools = toolsFor({ roles: await rolesFor(grant), singleStoreSlug: defaultSlug });
  const server = buildServer(tools, authorization, defaultSlug);

  const transport = new WebStandardStreamableHTTPServerTransport({
    // No session id: the bearer token is the whole session.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(req);
}
