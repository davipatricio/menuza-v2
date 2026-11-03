//! `DELETE /account/sessions/{sessionId}` — revoke one session of the account.
//!
//! The path segment is the SHA-256 digest `GET /account/sessions` exposed, never
//! a bearer token. The statement is filtered by member id, so another member's
//! digest is not in the set: the count comes back zero and nothing leaks.
//! Revoking the caller's own row is allowed — that is a logout.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::tenant::account::{RevokeSessionInput, RevokeSessionOutput};
use persistence::tenant::account::session_revoke_by_member;

use super::support::{assert_same_origin, now, require_tenant_member};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    delete,
    path = "/account/sessions/{sessionId}",
    operation_id = "revokeAccountSession",
    tag = "account",
    params(
        ("sessionId" = String, Path, description = "SHA-256 digest of the session token.")
    ),
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
pub async fn revoke_session(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<Json<RevokeSessionOutput>, ApiError> {
    assert_same_origin(&headers)?;

    let input = RevokeSessionInput { session_id };
    input.validate().map_err(ApiError)?;

    let session = require_tenant_member(&state, &headers).await?;

    let revoked =
        session_revoke_by_member(&state.pool, &session.member_id, &input.session_id, now())
            .await
            .map_err(db_error)?;

    Ok(Json(RevokeSessionOutput { revoked }))
}
