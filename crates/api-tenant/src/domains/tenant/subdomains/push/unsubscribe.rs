//! `DELETE /push/subscriptions` — remove one device subscription.
//!
//! The endpoint travels in the body, never as a path segment. The delete is
//! scoped by tenant and member, so another account's row is untouched and the
//! handler still answers success.

use axum::Json;
use axum::extract::State;
use contract::tenant::push::{PushSuccessOutput, PushUnsubscribeInput};
use menuza_http::extract::{SessionToken, TenantScope};
use persistence::tenant::push::push_subscription_delete;

use super::support::require_push_member;
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    delete,
    path = "/push/subscriptions",
    operation_id = "unsubscribePush",
    tag = "push",
    request_body = PushUnsubscribeInput,
    responses(
        (status = 200, body = PushSuccessOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn unsubscribe(
    State(state): State<crate::State>,
    scope: TenantScope,
    SessionToken(token): SessionToken,
    Json(input): Json<PushUnsubscribeInput>,
) -> Result<Json<PushSuccessOutput>, ApiError> {
    let (tenant, member) = require_push_member(&state, &scope, &token).await?;
    input.validate().map_err(ApiError)?;

    push_subscription_delete(&state.pool, &tenant, &member.member_id, &input.endpoint)
        .await
        .map_err(db_error)?;

    Ok(Json(PushSuccessOutput { success: true }))
}
