//! `PUT /account/password` — change the password and revoke every other session.
//!
//! The revocation is the point: without it a stolen cookie outlives the
//! credential it was opened with. The caller's own session survives so the form
//! does not log them out. Connected MCP grants are revoked too, because they are
//! bearer tokens that a `Session` revocation cannot reach.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::account::{ChangePasswordInput, ChangePasswordOutput};
use domain::password::{hash_password, verify_password};
use persistence::tenant::account::{
    mcp_sessions_revoke_member, member_update_password, sessions_revoke_all_except,
};
use persistence::tenant::session::member_by_id;

use super::support::{assert_same_origin, now, require_tenant_member};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    put,
    path = "/account/password",
    operation_id = "changeAccountPassword",
    tag = "account",
    request_body = ChangePasswordInput,
    responses(
        (status = 200, body = ChangePasswordOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn change_password(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Json(input): Json<ChangePasswordInput>,
) -> Result<Json<ChangePasswordOutput>, ApiError> {
    input.validate().map_err(ApiError)?;
    assert_same_origin(&headers)?;

    let session = require_tenant_member(&state, &headers).await?;

    let member = member_by_id(&state.pool, &session.member_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::unauthorized)?;

    if !verify_password(&input.current_password, member.password_hash.as_deref()) {
        return Err(ApiError::unauthorized());
    }

    // A member with no password hash is not an error: setting a password is how
    // such an account adopts one. Reuse needs a hash to compare against.
    if let Some(current_hash) = member.password_hash.as_deref()
        && verify_password(&input.new_password, Some(current_hash))
    {
        return Ok(Json(ChangePasswordOutput { changed: false }));
    }

    let password_hash =
        hash_password(&input.new_password).map_err(|_| ApiError(ErrorCode::Internal))?;
    let now = now();

    member_update_password(&state.pool, &member.id, &password_hash, now)
        .await
        .map_err(db_error)?;

    sessions_revoke_all_except(&state.pool, &member.id, &session.session_id, now)
        .await
        .map_err(db_error)?;

    mcp_sessions_revoke_member(&state.pool, &member.id, now)
        .await
        .map_err(db_error)?;

    Ok(Json(ChangePasswordOutput { changed: true }))
}
