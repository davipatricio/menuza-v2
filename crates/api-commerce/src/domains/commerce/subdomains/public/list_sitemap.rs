//! `GET /sitemap` — every public page of one store, by path only.

use axum::Json;
use axum::extract::State;
use contract::ErrorCode;
use contract::commerce::public::PublicSitemap;
use menuza_http::extract::TenantScope;
use persistence::commerce::public::sitemap;

use super::tenant_of;
use crate::domains::commerce::support::ApiError;

#[utoipa::path(
    get,
    path = "/sitemap",
    operation_id = "listPublicSitemap",
    tag = "public",
    responses(
        (status = 200, body = PublicSitemap),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_sitemap(
    State(state): State<crate::State>,
    scope: TenantScope,
) -> Result<Json<PublicSitemap>, ApiError> {
    let Some(tenant) = tenant_of(&scope)? else {
        return Ok(Json(PublicSitemap {
            entries: Vec::new(),
        }));
    };

    let sitemap = sitemap(&state.pool, &tenant)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?;

    Ok(Json(sitemap))
}
