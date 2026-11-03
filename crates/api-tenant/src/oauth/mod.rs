//! OAuth2 protocol surface, ported from `apps/tenant/src/oauth.ts`.
//!
//! Five endpoints, plus the metadata document remote clients discover first.
//! None of them is a panel resource: no route here has an operation id, and
//! `openapi()` deliberately does not merge this module, so the protocol stays
//! out of `crates/openapi/tenant.json` the way OAuth2 and `/mcp` always did.
//!
//! Session reuse is the tenant dashboard cookie — `POST /oauth/authorize` is
//! the only endpoint that needs one; the rest authenticate by the token they
//! carry or by the client they name.

mod authorize;
mod client_check;
mod metadata;
mod revoke;
mod support;
mod token;

/// Routes this surface owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/.well-known/oauth-authorization-server",
            axum::routing::get(metadata::metadata).options(support::preflight),
        )
        .route(
            "/oauth/token",
            axum::routing::post(token::token).options(support::preflight),
        )
        .route(
            "/oauth/client-check",
            axum::routing::get(client_check::client_check),
        )
        .route(
            "/oauth/authorize",
            axum::routing::post(authorize::authorize),
        )
        .route(
            "/oauth/revoke",
            axum::routing::post(revoke::revoke).options(support::preflight),
        )
}
