//! internal subdomain routes: host resolution for server-to-server callers.
//!
//! The one route here is gated by the shared internal token, never a browser
//! session: it is the tenant-enumeration oracle the token exists to close.

mod resolve_host;

use utoipa::OpenApi as _;

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/internal/resolve-host",
        axum::routing::get(resolve_host::resolve_host),
    )
}

/// Paths this subdomain contributes to the tenant document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(resolve_host::resolve_host),
        components(schemas(contract::tenant::internal::ResolveHostOutput))
    )]
    struct Api;

    Api::openapi()
}
