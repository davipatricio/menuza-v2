//! `GET /menu` — the buyer-facing catalog, already nested and filtered.

use axum::Json;
use axum::extract::State;
use contract::ErrorCode;
use contract::commerce::public::PublicMenu;
use menuza_http::extract::TenantScope;
use persistence::commerce::public::menu;

use super::tenant_of;
use crate::domains::commerce::support::ApiError;

#[utoipa::path(
    get,
    path = "/menu",
    operation_id = "listPublicMenu",
    tag = "public",
    responses(
        (status = 200, body = PublicMenu),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_menu(
    State(state): State<crate::State>,
    scope: TenantScope,
) -> Result<Json<PublicMenu>, ApiError> {
    let Some(tenant) = tenant_of(&scope)? else {
        return Ok(Json(PublicMenu {
            departments: Vec::new(),
            uncategorized: Vec::new(),
        }));
    };

    // The storefront read publishes every department; the filter serves a
    // single-department page, which the contract does not expose yet.
    let menu = menu(&state.pool, &tenant, None)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?;

    Ok(Json(menu))
}
