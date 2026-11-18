//! `GET /stores/{slug}` — the storefront resolved from its public slug.
//!
//! The host-based `/store` needs an edge that already resolved the tenant. A
//! native client has no host, so it names the store by slug once and then sends
//! the returned `tenantId` on every other request.

use axum::Json;
use axum::extract::{Path, State};
use contract::ErrorCode;
use contract::commerce::public::PublicStore;
use persistence::commerce::public::store_by_slug;

use crate::domains::commerce::support::ApiError;

#[utoipa::path(
    get,
    path = "/stores/{slug}",
    operation_id = "getPublicStoreBySlug",
    tag = "public",
    params(
        ("slug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PublicStore),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_store_by_slug(
    State(state): State<crate::State>,
    Path(slug): Path<String>,
) -> Result<Json<PublicStore>, ApiError> {
    let store = store_by_slug(&state.pool, &slug)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?
        .ok_or(ApiError(ErrorCode::NotFound))?;

    Ok(Json(store))
}
