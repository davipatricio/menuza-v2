//! `GET /account/sessions` — the account's live sessions, newest used first.
//!
//! Only the `tenant` namespace is listed: the commerce session is a different
//! product surface. Revoked, expired and idle rows are filtered out rather than
//! shown as dead, because the list exists to answer "should I kill this one?".
//! The row id is the token digest, safe to display and to send back.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use chrono::Duration;
use contract::tenant::account::{ActiveSession, ActiveSessionsOutput};
use domain::session::SESSION_IDLE_SECONDS;
use persistence::tenant::account::sessions_by_member;

use super::support::{now, require_tenant_member, to_panel_timestamp};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    get,
    path = "/account/sessions",
    operation_id = "listAccountSessions",
    tag = "account",
    responses(
        (status = 200, body = ActiveSessionsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_sessions(
    State(state): State<crate::State>,
    headers: HeaderMap,
) -> Result<Json<ActiveSessionsOutput>, ApiError> {
    let session = require_tenant_member(&state, &headers).await?;
    let now = now();

    let rows = sessions_by_member(&state.pool, &session.member_id, "tenant")
        .await
        .map_err(db_error)?;

    let idle_cutoff = now - Duration::seconds(SESSION_IDLE_SECONDS);

    let mut live: Vec<_> = rows
        .into_iter()
        .filter(|row| {
            row.revoked_at.is_none() && row.expires_at > now && row.last_used_at > idle_cutoff
        })
        .collect();

    live.sort_by_key(|row| std::cmp::Reverse(row.last_used_at));

    Ok(Json(ActiveSessionsOutput {
        sessions: live
            .into_iter()
            .map(|row| ActiveSession {
                current: row.id == session.session_id,
                id: row.id,
                created_at: to_panel_timestamp(row.created_at),
                last_used_at: to_panel_timestamp(row.last_used_at),
                expires_at: to_panel_timestamp(row.expires_at),
            })
            .collect(),
    }))
}
