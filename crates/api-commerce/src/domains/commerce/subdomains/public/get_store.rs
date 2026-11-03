//! `GET /store` — the resolved store's identity plus its SEO.

use axum::Json;
use axum::extract::State;
use contract::ErrorCode;
use contract::commerce::public::{PublicSeo, PublicStore};
use menuza_http::extract::TenantScope;
use persistence::commerce::public::store;

use super::tenant_of;
use crate::domains::commerce::support::ApiError;

/// A request that resolved no tenant claims nothing: empty fields and an empty
/// SEO, never an error.
fn no_store() -> PublicStore {
    PublicStore {
        tenant_id: None,
        slug: String::new(),
        display_name: String::new(),
        seo: PublicSeo {
            title: String::new(),
            description: None,
            social_image_url: None,
            canonical_url: None,
            json_ld: None,
        },
    }
}

#[utoipa::path(
    get,
    path = "/store",
    operation_id = "getPublicStore",
    tag = "public",
    responses(
        (status = 200, body = PublicStore),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_store(
    State(state): State<crate::State>,
    scope: TenantScope,
) -> Result<Json<PublicStore>, ApiError> {
    let Some(tenant) = tenant_of(&scope)? else {
        return Ok(Json(no_store()));
    };

    let store = store(&state.pool, &tenant)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?;

    Ok(Json(store))
}
