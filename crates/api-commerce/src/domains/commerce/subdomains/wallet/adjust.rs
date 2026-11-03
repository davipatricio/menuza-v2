//! `POST /wallet/adjust` — the operator's manual correction, a store credit or
//! a clawback with a mandatory reason.
//!
//! The sign is the caller's, so the same body covers both directions. The
//! persistence layer refuses a balance below zero, and that refusal is a
//! `CONFLICT`, not a 500.

use axum::Json;
use axum::extract::State;
use contract::ErrorCode;
use contract::commerce::wallet::{AdjustWalletInput, AdjustWalletOutput};
use menuza_http::extract::{CommerceSession, TenantScope};
use persistence::commerce::wallet::{self, AdjustError};

use super::tenant_of;
use crate::domains::commerce::support::{ApiError, require_capability, require_member};

/// A refused correction as the catalog code the client switches on.
fn error_of(error: AdjustError) -> ApiError {
    match error {
        AdjustError::NotFound => ApiError::not_found(),
        AdjustError::Insufficient => ApiError(ErrorCode::Conflict),
        AdjustError::Db(_) => ApiError(ErrorCode::Internal),
    }
}

#[utoipa::path(
    post,
    path = "/wallet/adjust",
    operation_id = "adjustWallet",
    tag = "wallet",
    request_body = AdjustWalletInput,
    responses(
        (status = 200, body = AdjustWalletOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn adjust_wallet(
    State(state): State<crate::State>,
    scope: TenantScope,
    session: CommerceSession,
    Json(input): Json<AdjustWalletInput>,
) -> Result<Json<AdjustWalletOutput>, ApiError> {
    let tenant = tenant_of(&scope)?;
    let member = require_member(&state.pool, &tenant, &session.0).await?;
    require_capability(&member, "wallet:adjust")?;

    input.validate().map_err(ApiError)?;

    let balance_cents = wallet::adjust(
        &state.pool,
        &tenant,
        &input.customer_id,
        input.amount_cents,
        &input.reason,
        &member.member_id,
    )
    .await
    .map_err(error_of)?;

    Ok(Json(AdjustWalletOutput { balance_cents }))
}

#[cfg(test)]
mod tests {
    use contract::ErrorCode;
    use persistence::commerce::wallet::AdjustError;

    use super::error_of;

    #[test]
    fn adjust_errors_map_to_the_catalog() {
        assert_eq!(error_of(AdjustError::Insufficient).0, ErrorCode::Conflict);
        assert_eq!(error_of(AdjustError::NotFound).0, ErrorCode::NotFound);
    }
}
