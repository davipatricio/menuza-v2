//! Tenant API router, `:3002`. Panel, OAuth2 and MCP.

mod domains;
mod mcp;
mod oauth;

use domains::tenant::subdomains;

/// What the shared shell needs from this binary: a pool and a config.
#[derive(Clone)]
pub struct State {
    pub pool: sqlx::PgPool,
    pub config: menuza_http::Config,
}

impl menuza_http::AppState for State {
    fn pool(&self) -> &sqlx::PgPool {
        &self.pool
    }

    fn config(&self) -> &menuza_http::Config {
        &self.config
    }
}

/// Routes the binary mounts under the shared shell.
pub fn router() -> axum::Router<State> {
    axum::Router::new()
        .route("/health", axum::routing::get(health))
        .merge(subdomains::public::router())
        .merge(subdomains::session::router())
        .merge(subdomains::account::router())
        .merge(subdomains::profile::router())
        .merge(subdomains::internal::router())
        .merge(subdomains::push::router())
        .merge(subdomains::panel::router())
        .merge(oauth::router())
        .merge(mcp::router())
}

/// The tenant document `crates/openapi` emits.
pub fn openapi() -> utoipa::openapi::OpenApi {
    let mut document = health_openapi();
    document.merge(subdomains::public::openapi());
    document.merge(subdomains::session::openapi());
    document.merge(subdomains::account::openapi());
    document.merge(subdomains::profile::openapi());
    document.merge(subdomains::internal::openapi());
    document.merge(subdomains::push::openapi());
    document.merge(subdomains::panel::openapi());

    document
}

/// The health probe, the one route this binary already owned.
fn health_openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(paths(health), components(schemas(contract::tenant::Health)))]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The shape the retired endpoint returned, unchanged.
#[utoipa::path(
    get,
    path = "/health",
    operation_id = "getTenantHealth",
    tag = "public",
    responses((status = 200, body = contract::tenant::Health))
)]
pub async fn health() -> axum::Json<contract::tenant::Health> {
    axum::Json(contract::tenant::Health::new(
        contract::tenant::ServiceName::Tenant,
    ))
}
