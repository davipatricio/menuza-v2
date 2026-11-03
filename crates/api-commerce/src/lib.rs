//! Commerce API router, `:3001`.

mod domains;

use domains::commerce::subdomains;

/// What the shared shell needs from this binary: a pool, a config and the
/// insert-only River client producers enqueue through.
#[derive(Clone)]
pub struct State {
    pub pool: sqlx::PgPool,
    pub config: menuza_http::Config,
    pub river: riverqueue::Client,
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
        .merge(subdomains::orders::router())
        .merge(subdomains::wallet::router())
        .merge(subdomains::payments::router())
}

/// The commerce document `crates/openapi` emits.
pub fn openapi() -> utoipa::openapi::OpenApi {
    let mut document = health_openapi();
    document.merge(subdomains::public::openapi());
    document.merge(subdomains::orders::openapi());
    document.merge(subdomains::wallet::openapi());
    document.merge(subdomains::payments::openapi());

    document
}

/// The health probe, the one route this binary already owned.
fn health_openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(paths(health), components(schemas(contract::commerce::Health)))]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The shape the retired endpoint returned, unchanged.
#[utoipa::path(
    get,
    path = "/health",
    operation_id = "getCommerceHealth",
    tag = "public",
    responses((status = 200, body = contract::commerce::Health))
)]
pub async fn health() -> axum::Json<contract::commerce::Health> {
    axum::Json(contract::commerce::Health::new(
        contract::commerce::ServiceName::Commerce,
    ))
}
