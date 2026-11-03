//! The admin MCP endpoint, ported from `apps/tenant/src/mcp/server.ts`.
//!
//! Stateless Streamable HTTP: one fresh handler per request, bound to the bearer
//! token that arrived with it. Statelessness is deliberate — a session id would
//! have to be mapped to a member and a grant server-side, and the token already
//! carries both, so the request is the whole state. No `Mcp-Session-Id` is
//! issued, and a JSON POST is answered with JSON.
//!
//! Authentication happens here, once, in the order the port pinned: bearer token
//! → grant → the stores it covers → the dashboard integration switch. Only then
//! does the transport see the request. A tool call that lands later re-checks
//! the capability it mirrors; this gate adds no authority of its own.

use std::future::Future;
use std::sync::Arc;

use crate::domains::tenant::support::TenantRole;
use axum::Json;
use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use chrono::{NaiveDateTime, Utc};
use contract::mcp::McpErrorOutput;
use domain::oauth::hash_oauth_token;
use persistence::mcp::{
    GrantMembership, NewMcpSession, grant_memberships, mcp_integration_enabled, mcp_session_create,
    mcp_session_touch, oauth_token_find,
};
use persistence::tenant::TenantId;
use rmcp::ErrorData as McpError;
use rmcp::ServerHandler;
use rmcp::model::{
    CallToolRequestParams, CallToolResponse, Implementation, ListToolsResult,
    PaginatedRequestParams, ServerCapabilities, ServerConfig,
};
use rmcp::service::{MaybeSendFuture, RequestContext, RoleServer};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::never::NeverSessionManager,
};
use tower::Service as _;

/// The token behind one MCP request, narrowed to what the gate needs.
struct CallerGrant {
    member_id: String,
    /// The stores the token was granted; a token always carries its array.
    tenant_ids: Vec<String>,
    /// `OAuthToken.id`, for recording the session row.
    token_id: String,
    /// The SHA-256 digest, the session row's key.
    token_digest: String,
}

/// One store this request may reach: the tenant, its slug and the member's role
/// on it. Built from the grant once per request, never from tool arguments.
pub(crate) struct AllowedStore {
    pub tenant: TenantId,
    pub slug: String,
    pub role: TenantRole,
}

/// The tool catalog bound to the grant this request resolved to.
pub(crate) struct McpHandler {
    pub pool: sqlx::PgPool,
    pub allowed: Arc<Vec<AllowedStore>>,
    /// Whether the grant covers exactly one store, enabled or not: the flag
    /// that drops `storeSlug` from every tool schema.
    pub single_store: bool,
    pub member_id: String,
}

impl ServerHandler for McpHandler {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("menuza-admin", "1.0.0"))
    }

    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<ListToolsResult, McpError>> + MaybeSendFuture + '_ {
        std::future::ready(Ok(ListToolsResult::with_all_items(
            crate::mcp::tools::list(&self.allowed, self.single_store)
                .into_iter()
                .map(crate::mcp::tools::ToolSpec::into_tool)
                .collect(),
        )))
    }

    fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> impl Future<Output = Result<CallToolResponse, McpError>> + MaybeSendFuture + '_ {
        crate::mcp::tools::call(self, request)
    }
}

/// `POST /mcp` (and `GET`/`DELETE` on the same path, which the transport
/// answers itself).
pub async fn mcp(State(state): State<crate::State>, request: Request) -> Response {
    let grant = match grant_for(&state, request.headers()).await {
        Ok(Some(grant)) => grant,
        Ok(None) => return unauthorized(),
        Err(()) => return server_error(),
    };

    let (allowed, single_store) = match allowed_tenants(&state, &grant).await {
        Ok(allowed) => allowed,
        Err(()) => return server_error(),
    };

    // Only the stores that switched the integration on serve tools. A token
    // granted two stores gets the one that agreed, not both.
    if allowed.is_empty() {
        return integration_disabled();
    }

    let now = Utc::now().naive_utc();
    let client_name = client_name_of(request.headers());

    for store in &allowed {
        if touch_session(&state, &grant, &store.tenant, &client_name, now)
            .await
            .is_err()
        {
            return server_error();
        }
    }

    let hosts = state.config.mcp_allowed_hosts.clone();
    let pool = state.pool.clone();
    let member_id = grant.member_id.clone();
    let allowed = Arc::new(allowed);

    // Stateless: no session id, no SSE priming, JSON for a JSON request. The
    // handler carries the grant's stores, so the catalog is resolved per
    // request and never from a tool argument.
    let service: StreamableHttpService<McpHandler, NeverSessionManager> =
        StreamableHttpService::new(
            move || {
                Ok(McpHandler {
                    pool: pool.clone(),
                    allowed: Arc::clone(&allowed),
                    single_store,
                    member_id: member_id.clone(),
                })
            },
            Arc::new(NeverSessionManager::default()),
            StreamableHttpServerConfig::default()
                .with_legacy_session_mode(false)
                .with_json_response(true)
                .with_sse_keep_alive(None)
                .with_allowed_hosts(hosts),
        );

    let mut service = service;

    // The transport's error type is `Infallible`: the response is matched
    // exhaustively instead of being probed for failure.
    match service.call(request).await {
        Ok(response) => response.map(axum::body::Body::new),
        Err(never) => match never {},
    }
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        [(header::WWW_AUTHENTICATE.as_str(), "Bearer")],
        Json(McpErrorOutput::new(
            "invalid_token",
            "Bearer token ausente ou inválido.",
        )),
    )
        .into_response()
}

fn integration_disabled() -> Response {
    (
        StatusCode::FORBIDDEN,
        Json(McpErrorOutput::new(
            "integration_disabled",
            "A integração MCP não está ativada nesta loja.",
        )),
    )
        .into_response()
}

/// A failed read is the caller's error only when it is theirs; a database that
/// did not answer is a server failure, never a silent 401.
fn server_error() -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(McpErrorOutput::new(
            "server_error",
            "Falha ao atender a requisição MCP.",
        )),
    )
        .into_response()
}

/// Resolves `Authorization: Bearer <token>` to its grant.
///
/// A missing scheme, an unknown digest, a revoked or expired row all answer
/// `Ok(None)`: the gate must not tell one from the other. A database that did
/// not answer is `Err(())`, because that is a server failure and must not read
/// as a bad token.
async fn grant_for(state: &crate::State, headers: &HeaderMap) -> Result<Option<CallerGrant>, ()> {
    let Some(raw) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
    else {
        return Ok(None);
    };

    let Some((scheme, token)) = raw.split_once(char::is_whitespace) else {
        return Ok(None);
    };

    if !scheme.eq_ignore_ascii_case("bearer") {
        return Ok(None);
    }

    let token = token.trim();

    if token.is_empty() {
        return Ok(None);
    }

    let digest = hash_oauth_token(token);
    let Some(row) = oauth_token_find(&state.pool, &digest)
        .await
        .map_err(|_| ())?
    else {
        return Ok(None);
    };

    if row.revoked_at.is_some() || row.expires_at <= Utc::now().naive_utc() {
        return Ok(None);
    }

    Ok(Some(CallerGrant {
        member_id: row.member_id,
        tenant_ids: row.tenant_ids,
        token_id: row.id,
        token_digest: digest,
    }))
}

/// The grant's stores that switched the dashboard MCP integration on, in
/// membership order, with the member's role on each — plus whether the grant
/// itself covers exactly one store. The flag counts every granted store, so a
/// two-store grant with one enabled store still keeps `storeSlug`.
async fn allowed_tenants(
    state: &crate::State,
    grant: &CallerGrant,
) -> Result<(Vec<AllowedStore>, bool), ()> {
    let memberships = grant_memberships(&state.pool, &grant.member_id, &grant.tenant_ids)
        .await
        .map_err(|_| ())?;

    let single_store = memberships.len() == 1;
    let mut allowed = Vec::new();

    for GrantMembership {
        tenant_id,
        slug,
        role,
    } in memberships
    {
        let Ok(tenant) = TenantId::parse(&tenant_id) else {
            continue;
        };

        if mcp_integration_enabled(&state.pool, &tenant)
            .await
            .map_err(|_| ())?
        {
            // The stored role string is canonicalized the same way the panel
            // does it: an unknown one is the least-privileged known role.
            allowed.push(AllowedStore {
                tenant,
                slug,
                role: TenantRole::parse(&role).unwrap_or(TenantRole::Staff),
            });
        }
    }

    Ok((allowed, single_store))
}

/// Records (or refreshes) the `McpSession` row for this token on this store.
///
/// The row is what the dashboard lists and revokes, so it is created the first
/// time a token is used and its `lastUsedAt` slides afterwards. Keyed by the
/// token digest, so one token maps to one row however many tools it calls.
async fn touch_session(
    state: &crate::State,
    grant: &CallerGrant,
    tenant: &TenantId,
    client_name: &str,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    if mcp_session_touch(&state.pool, &grant.token_digest, now).await? {
        return Ok(());
    }

    let label = format!("{client_name} — {}", now.date());

    mcp_session_create(
        &state.pool,
        &NewMcpSession {
            tenant_id: tenant,
            member_id: &grant.member_id,
            label: &label,
            client_name,
            oauth_token_id: &grant.token_id,
            token_digest: &grant.token_digest,
            last_used_at: now,
            created_at: now,
        },
    )
    .await
}

/// The client's self-chosen name, or the stable fallback the port used.
fn client_name_of(headers: &HeaderMap) -> String {
    headers
        .get("x-menuza-mcp-client")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|raw| !raw.is_empty() && raw.chars().count() <= 60)
        .unwrap_or("Cliente MCP")
        .to_owned()
}
