//! `GET /session/current` — the member, its stores and onboarding answers.
//!
//! The cookie is validated by the shared `require_member`; the member is then
//! re-read so a deleted row answers `UNAUTHORIZED`, never a partial session.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use contract::tenant::session::CurrentOutput;
use persistence::tenant::session::member_by_id;

use super::support::{load_memberships, load_onboarding, require_tenant_member, to_session_member};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    get,
    path = "/session/current",
    operation_id = "getTenantSession",
    tag = "session",
    responses(
        (status = 200, body = CurrentOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn current(
    State(state): State<crate::State>,
    headers: HeaderMap,
) -> Result<Json<CurrentOutput>, ApiError> {
    let session = require_tenant_member(&state, &headers).await?;

    let member = member_by_id(&state.pool, &session.member_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::unauthorized)?;

    Ok(Json(CurrentOutput {
        member: to_session_member(&member),
        memberships: load_memberships(&state.pool, &member.id).await?,
        onboarding: load_onboarding(&state.pool, &member.id).await?,
    }))
}
