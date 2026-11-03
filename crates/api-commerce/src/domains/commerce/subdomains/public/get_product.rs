//! `GET /products/{productId}` — the direct URL read.
//!
//! Hidden products are reachable here by design, archived ones come back so the
//! page can render the pause notice, and an inactive or private product answers
//! `{ "product": null }` — null, never 404: the caller decides what to render.

use axum::Json;
use axum::extract::{Path, State};
use contract::ErrorCode;
use contract::commerce::public::PublicProductDetail;
use menuza_http::extract::TenantScope;
use persistence::commerce::public::product;

use super::tenant_of;
use crate::domains::commerce::support::ApiError;

/// The TS contract's `{ product: <detail> | null }` output, which is not a
/// shared shape: only this read answers it.
#[derive(Debug, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProductResponse {
    pub product: Option<PublicProductDetail>,
}

/// `v.pipe(v.string(), v.nonEmpty(), v.maxLength(64))`, verbatim.
const MAX_PRODUCT_ID: usize = 64;

fn product_id_is_valid(raw: &str) -> bool {
    !raw.is_empty() && raw.len() <= MAX_PRODUCT_ID
}

#[utoipa::path(
    get,
    path = "/products/{productId}",
    operation_id = "getPublicProduct",
    tag = "public",
    params(("productId" = String, Path, description = "Product id.")),
    responses(
        (status = 200, body = ProductResponse),
        (status = 400, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_product(
    State(state): State<crate::State>,
    scope: TenantScope,
    Path(product_id): Path<String>,
) -> Result<Json<ProductResponse>, ApiError> {
    if !product_id_is_valid(&product_id) {
        return Err(ApiError(ErrorCode::ValidationFailed));
    }

    let Some(tenant) = tenant_of(&scope)? else {
        return Ok(Json(ProductResponse { product: None }));
    };

    let product = product(&state.pool, &tenant, &product_id)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?;

    Ok(Json(ProductResponse { product }))
}

#[cfg(test)]
mod tests {
    use super::product_id_is_valid;

    #[test]
    fn product_id_matches_the_input_pipe() {
        assert!(product_id_is_valid("p1"));
        assert!(product_id_is_valid(&"a".repeat(64)));

        assert!(!product_id_is_valid(""));
        assert!(!product_id_is_valid(&"a".repeat(65)));
    }
}
