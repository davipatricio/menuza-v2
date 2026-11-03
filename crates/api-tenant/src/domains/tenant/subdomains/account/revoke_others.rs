//! `POST /account/sessions/revoke-others` — sign out everywhere except here.
//!
//! One call rather than a loop the client assembles, so a compromised session
//! cannot be interrupted halfway with some stolen cookies still live. Connected
//! MCP grants are revoked too: they are bearer tokens no `Session` row reaches.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use contract::tenant::account::RevokeSessionOutput;
use persistence::tenant::account::{mcp_sessions_revoke_member, sessions_revoke_all_except};

use super::support::{assert_same_origin, now, require_tenant_member};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    post,
    path = "/account/sessions/revoke-others",
    operation_id = "revokeOtherAccountSessions",
    tag = "account",
    responses(
        (status = 200, body = RevokeSessionOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn revoke_other_sessions(
    State(state): State<crate::State>,
    headers: HeaderMap,
) -> Result<Json<RevokeSessionOutput>, ApiError> {
    assert_same_origin(&headers)?;

    let session = require_tenant_member(&state, &headers).await?;
    let now = now();

    let revoked =
        sessions_revoke_all_except(&state.pool, &session.member_id, &session.session_id, now)
            .await
            .map_err(db_error)?;

    mcp_sessions_revoke_member(&state.pool, &session.member_id, now)
        .await
        .map_err(db_error)?;

    Ok(Json(RevokeSessionOutput { revoked }))
}
