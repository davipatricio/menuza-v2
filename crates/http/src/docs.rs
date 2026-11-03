//! Development-only API reference.
//!
//! Scalar embeds the document in the served HTML, so there is no second JSON
//! route to keep in sync with the spec `crates/openapi` emits. Production gets
//! the router back untouched: the reference is a development tool, not a public
//! surface.

use utoipa::openapi::OpenApi;
use utoipa_scalar::{Scalar, Servable};

use crate::{AppState, Env};

/// Mounts the reference at `/docs` in development, and not at all in production.
pub fn mount<S: AppState>(router: axum::Router<S>, openapi: OpenApi, env: Env) -> axum::Router<S> {
    if env.is_development() {
        let scalar = Scalar::with_url("/docs", openapi);
        router.merge(axum::Router::from(scalar))
    } else {
        router
    }
}
