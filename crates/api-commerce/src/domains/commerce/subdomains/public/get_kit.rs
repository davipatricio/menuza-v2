//! `GET /kits/{slug}` — the direct URL read of one kit.
//!
//! An unknown slug, an archived kit, or one hidden because it cannot reach its
//! minimums answers `{ "kit": null }`, never a 404: the caller decides what to
//! render.

use axum::Json;
use axum::extract::{Path, State};
use contract::ErrorCode;
use contract::commerce::public::PublicKitOutput;
use menuza_http::extract::TenantScope;
use persistence::commerce::public::kit;

use super::tenant_of;
use crate::domains::commerce::support::ApiError;

/// The longest slug the editor mints.
const MAX_SLUG: usize = 80;

#[utoipa::path(
    get,
    path = "/kits/{slug}",
    operation_id = "getPublicKit",
    tag = "public",
    params(("slug" = String, Path, description = "Kit slug.")),
    responses(
        (status = 200, body = PublicKitOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_kit(
    State(state): State<crate::State>,
    scope: TenantScope,
    Path(slug): Path<String>,
) -> Result<Json<PublicKitOutput>, ApiError> {
    if slug.is_empty() || slug.len() > MAX_SLUG {
        return Err(ApiError(ErrorCode::ValidationFailed));
    }

    let Some(tenant) = tenant_of(&scope)? else {
        return Ok(Json(PublicKitOutput { kit: None }));
    };

    let kit = kit(&state.pool, &tenant, &slug)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?;

    Ok(Json(PublicKitOutput { kit }))
}
