//! kits resource: panel routes.
//!
//! The panel only reads kits: the list carries each kit's mode, availability
//! and item count, ordered by name. Kits are assembled elsewhere, so this
//! resource owns no write.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::tenant::panel::kits::{PanelKit, PanelKitsOutput};
use persistence::tenant::panel::kits::kit_list;

use super::support::context;
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/panel/stores/{storeSlug}/kits",
        axum::routing::get(list_kits),
    )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(list_kits),
        components(schemas(
            contract::tenant::panel::kits::PanelKit,
            contract::tenant::panel::kits::PanelKitsOutput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Kits with their item counts, ordered by name.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/kits",
    operation_id = "listPanelKits",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelKitsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_kits(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelKitsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = kit_list(&state.pool, &ctx.tenant).await.map_err(db_error)?;

    let kits = rows
        .into_iter()
        .map(|row| PanelKit {
            id: row.id,
            name: row.name,
            mode: row.mode,
            available: row.available,
            items_count: row.items_count,
        })
        .collect();

    Ok(Json(PanelKitsOutput { kits }))
}
