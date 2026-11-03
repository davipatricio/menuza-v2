//! `PUT /push/preferences` — replace the events one member enabled.
//!
//! The replace is one transaction: a failed insert never leaves the member with
//! an empty preference set.

use axum::Json;
use axum::extract::State;
use chrono::Utc;
use contract::tenant::push::{PushPreferencesInput, PushPreferencesOutput};
use menuza_http::extract::{SessionToken, TenantScope};
use persistence::tenant::push::push_preferences_replace;

use super::support::require_push_member;
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    put,
    path = "/push/preferences",
    operation_id = "updatePushPreferences",
    tag = "push",
    request_body = PushPreferencesInput,
    responses(
        (status = 200, body = PushPreferencesOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_preferences(
    State(state): State<crate::State>,
    scope: TenantScope,
    SessionToken(token): SessionToken,
    Json(input): Json<PushPreferencesInput>,
) -> Result<Json<PushPreferencesOutput>, ApiError> {
    let (tenant, member) = require_push_member(&state, &scope, &token).await?;
    input.validate().map_err(ApiError)?;

    let events: Vec<&str> = input.events.iter().map(|event| event.as_str()).collect();

    push_preferences_replace(
        &state.pool,
        &tenant,
        &member.member_id,
        &events,
        Utc::now().naive_utc(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PushPreferencesOutput {
        events: input.events,
    }))
}
