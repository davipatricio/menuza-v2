//! `POST /push/subscriptions` — register or refresh a device subscription.
//!
//! The endpoint is globally unique. A row that belongs to another tenant or
//! member is `FORBIDDEN`, never overwritten: a shared browser must not let one
//! account take over another account's push channel.

use axum::Json;
use axum::extract::State;
use chrono::{DateTime, NaiveDateTime, Utc};
use contract::ErrorCode;
use contract::tenant::push::{PushSubscriptionInput, PushSuccessOutput};
use menuza_http::extract::{SessionToken, TenantScope};
use persistence::tenant::push::{
    push_subscription_by_endpoint, push_subscription_insert, push_subscription_update,
};

use super::support::require_push_member;
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    post,
    path = "/push/subscriptions",
    operation_id = "subscribePush",
    tag = "push",
    request_body = PushSubscriptionInput,
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
pub async fn subscribe(
    State(state): State<crate::State>,
    scope: TenantScope,
    SessionToken(token): SessionToken,
    Json(input): Json<PushSubscriptionInput>,
) -> Result<Json<PushSuccessOutput>, ApiError> {
    let (tenant, member) = require_push_member(&state, &scope, &token).await?;
    input.validate().map_err(ApiError)?;

    let expiration_time = input.expiration_time.map(expiration_time).transpose()?;
    let now = Utc::now().naive_utc();

    let existing = push_subscription_by_endpoint(&state.pool, &input.endpoint)
        .await
        .map_err(db_error)?;

    if let Some(existing) = existing {
        if existing.tenant_id != tenant.as_str() || existing.member_id != member.member_id {
            return Err(ApiError::forbidden());
        }

        push_subscription_update(
            &state.pool,
            &tenant,
            &existing.id,
            &input.keys.p256dh,
            &input.keys.auth,
            expiration_time,
            now,
        )
        .await
        .map_err(db_error)?;

        return Ok(Json(PushSuccessOutput { success: true }));
    }

    push_subscription_insert(
        &state.pool,
        &tenant,
        &member.member_id,
        &input.endpoint,
        &input.keys.p256dh,
        &input.keys.auth,
        expiration_time,
        now,
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PushSuccessOutput { success: true }))
}

/// `Temporal.Instant.fromEpochMilliseconds(...)`; an out-of-range value is a
/// validation failure, not a panic.
fn expiration_time(milliseconds: i64) -> Result<NaiveDateTime, ApiError> {
    DateTime::<Utc>::from_timestamp_millis(milliseconds)
        .map(|instant| instant.naive_utc())
        .ok_or(ApiError(ErrorCode::ValidationFailed))
}
