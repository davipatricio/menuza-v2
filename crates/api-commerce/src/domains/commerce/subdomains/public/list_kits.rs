//! `GET /kits` — the kits the storefront offers.
//!
//! Anonymous like the rest of this subdomain. An archived or switched-off kit is
//! absent; one that cannot reach its minimums is either hidden or kept with
//! `available: false`, depending on the kit's own setting.

use axum::Json;
use axum::extract::State;
use contract::ErrorCode;
use contract::commerce::public::PublicKitsOutput;
use menuza_http::extract::TenantScope;
use persistence::commerce::public::kits;

use super::tenant_of;
use crate::domains::commerce::support::ApiError;

#[utoipa::path(
    get,
    path = "/kits",
    operation_id = "listPublicKits",
    tag = "public",
    responses(
        (status = 200, body = PublicKitsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_kits(
    State(state): State<crate::State>,
    scope: TenantScope,
) -> Result<Json<PublicKitsOutput>, ApiError> {
    let Some(tenant) = tenant_of(&scope)? else {
        return Ok(Json(PublicKitsOutput { kits: Vec::new() }));
    };

    let kits = kits(&state.pool, &tenant)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?;

    Ok(Json(PublicKitsOutput { kits }))
}
