//! public subdomain routes: the VAPID public key.
//!
//! Scaffolding only; the route lands in a later step. The health probe is not a
//! subdomain — it lives in `crate::lib` beside `router()`, because it answers
//! without a tenant, a session or a pool.

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
}

/// Paths this subdomain contributes to the tenant document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    utoipa::openapi::OpenApiBuilder::new().build()
}
