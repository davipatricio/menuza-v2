//! `GET /internal/resolve-host` — the storefront host -> tenant lookup the web
//! proxy calls with the shared internal token.
//!
//! `Domain` is tenant-scoped but the request arrives before any tenant is
//! known; the resolution is exactly the exception `Scope::unscoped` exists for.

use axum::Json;
use axum::extract::{Query, State};
use contract::tenant::internal::{ResolveHostInput, ResolveHostOutput};
use menuza_http::extract::InternalToken;
use persistence::tenant::internal::tenant_by_host;

use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    get,
    path = "/internal/resolve-host",
    operation_id = "resolveTenantByStorefrontHost",
    tag = "internal",
    params(("host" = String, Query, min_length = 1, max_length = 253)),
    responses(
        (status = 200, body = ResolveHostOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn resolve_host(
    State(state): State<crate::State>,
    _token: InternalToken,
    Query(input): Query<ResolveHostInput>,
) -> Result<Json<ResolveHostOutput>, ApiError> {
    input.validate().map_err(ApiError)?;

    let tenant = tenant_by_host(&state.pool, &input.host)
        .await
        .map_err(db_error)?;

    Ok(Json(ResolveHostOutput {
        tenant_id: tenant.map(|tenant| tenant.as_str().to_owned()),
    }))
}
