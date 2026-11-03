//! `GET /push/public-key` — the VAPID public key the browser subscribes with.
//!
//! Anonymous on purpose: the service worker needs it before a session exists.
//! An unset key is `INTERNAL`, never an empty string, matching the Bun handler.

use axum::Json;
use axum::extract::State;
use contract::ErrorCode;
use contract::tenant::push::GetPublicKeyOutput;

use crate::domains::tenant::support::ApiError;

#[utoipa::path(
    get,
    path = "/push/public-key",
    operation_id = "getPushPublicKey",
    tag = "push",
    responses(
        (status = 200, body = GetPublicKeyOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_public_key(
    State(state): State<crate::State>,
) -> Result<Json<GetPublicKeyOutput>, ApiError> {
    let public_key = state
        .config
        .vapid_public_key
        .clone()
        .ok_or(ApiError(ErrorCode::Internal))?;

    Ok(Json(GetPublicKeyOutput { public_key }))
}
