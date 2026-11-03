//! `POST /orders` — checkout.
//!
//! The Bun handler proves a store member holding `orders:write` and then lets
//! the pure engine price the cart; this port keeps that gate and hands the
//! input to persistence, which is the one place that decides cents, takes stock
//! and writes the order in a single tenant transaction. A refusal carries the
//! code the Bun backend surfaced, so a coupon or stock clash stays `CONFLICT`.

use axum::Json;
use axum::extract::State;
use contract::ErrorCode;
use contract::commerce::orders::{CreateOrderInput, CreateOrderOutput};
use menuza_http::extract::{CommerceSession, TenantScope};
use persistence::commerce::orders::{self, CreateOrderError};

use super::tenant_of;
use crate::domains::commerce::support::{ApiError, require_capability, require_member};

/// A refused checkout as the catalog code the client switches on.
fn error_of(error: CreateOrderError) -> ApiError {
    match error {
        CreateOrderError::Validation(code) => ApiError(code),
        CreateOrderError::NotFound => ApiError::not_found(),
        CreateOrderError::Db(_) => ApiError(ErrorCode::Internal),
        CreateOrderError::Queue(_) => ApiError(ErrorCode::Internal),
    }
}

#[utoipa::path(
    post,
    path = "/orders",
    operation_id = "createOrder",
    tag = "orders",
    request_body = CreateOrderInput,
    responses(
        (status = 200, body = CreateOrderOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_order(
    State(state): State<crate::State>,
    scope: TenantScope,
    session: CommerceSession,
    Json(input): Json<CreateOrderInput>,
) -> Result<Json<CreateOrderOutput>, ApiError> {
    let tenant = tenant_of(&scope)?;
    let member = require_member(&state.pool, &tenant, &session.0).await?;
    require_capability(&member, "orders:write")?;

    input.validate().map_err(ApiError)?;

    let output = orders::create(&state.pool, &state.river, &tenant, &input)
        .await
        .map_err(error_of)?;

    Ok(Json(output))
}

#[cfg(test)]
mod tests {
    use contract::ErrorCode;
    use persistence::commerce::orders::CreateOrderError;

    use super::error_of;

    #[test]
    fn create_errors_map_to_the_catalog() {
        assert_eq!(
            error_of(CreateOrderError::Validation(ErrorCode::Conflict)).0,
            ErrorCode::Conflict
        );
        assert_eq!(
            error_of(CreateOrderError::Validation(ErrorCode::ValidationFailed)).0,
            ErrorCode::ValidationFailed
        );
        assert_eq!(error_of(CreateOrderError::NotFound).0, ErrorCode::NotFound);
        assert_eq!(
            error_of(CreateOrderError::Db(sqlx::Error::PoolClosed)).0,
            ErrorCode::Internal
        );
    }
}
