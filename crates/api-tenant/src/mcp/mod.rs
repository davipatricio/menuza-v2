//! The admin MCP endpoint, ported from `apps/tenant/src/mcp/server.ts`.
//!
//! A protocol surface, not a panel resource: `router()` is merged into the
//! binary's router and `openapi()` does not exist here. Nothing under this
//! folder derives `utoipa::ToSchema` or carries `#[utoipa::path]`, so `/mcp`
//! stays out of `crates/openapi/tenant.json` — the rule OAuth2 and `/webhooks/*`
//! follow too.

mod server;
mod tools;

/// Routes this surface owns.
///
/// One path, every method the transport defines: `GET` and `DELETE` are answered
/// by the transport (or refused by it) after the same gate, exactly as before.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/mcp",
        axum::routing::post(server::mcp)
            .get(server::mcp)
            .delete(server::mcp),
    )
}
