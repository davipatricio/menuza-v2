//! `GET /push/preferences` — the events one member enabled for this tenant.

use axum::Json;
use axum::extract::State;
use contract::tenant::push::{PushEvent, PushPreferencesOutput};
use menuza_http::extract::{SessionToken, TenantScope};
use persistence::tenant::push::push_preferences;

use super::support::require_push_member;
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    get,
    path = "/push/preferences",
    operation_id = "getPushPreferences",
    tag = "push",
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
pub async fn get_preferences(
    State(state): State<crate::State>,
    scope: TenantScope,
    SessionToken(token): SessionToken,
) -> Result<Json<PushPreferencesOutput>, ApiError> {
    let (tenant, member) = require_push_member(&state, &scope, &token).await?;

    let rows = push_preferences(&state.pool, &tenant, &member.member_id)
        .await
        .map_err(db_error)?;

    Ok(Json(PushPreferencesOutput {
        events: rows
            .iter()
            .filter_map(|event| PushEvent::parse(event))
            .collect(),
    }))
}
