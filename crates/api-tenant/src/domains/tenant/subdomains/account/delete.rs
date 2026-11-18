//! `DELETE /account` — close the account and archive the stores nobody else owns.
//!
//! Deleting an account is not undoable, so the body must repeat the member's own
//! e-mail address: a stolen cookie cannot erase an account by sending an empty
//! body, and the check fails closed on a mismatch.
//!
//! A store the member was the last `owner` of is archived, never deleted. Its
//! `Order` rows are the buyers' receipts and the store's history, so the tenant
//! outlives the account and keeps its slug. The session cookie dies with the
//! member row it points at, so no separate logout call is needed.

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use contract::tenant::account::{DeleteAccountInput, DeleteAccountOutput};
use persistence::tenant::account::account_delete;
use persistence::tenant::session::member_by_id;

use super::support::{assert_same_origin, now, require_tenant_member};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    delete,
    path = "/account",
    operation_id = "deleteAccount",
    tag = "account",
    request_body = DeleteAccountInput,
    responses(
        (status = 200, body = DeleteAccountOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_account(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Json(input): Json<DeleteAccountInput>,
) -> Result<(StatusCode, Json<DeleteAccountOutput>), ApiError> {
    assert_same_origin(&headers)?;

    let session = require_tenant_member(&state, &headers).await?;

    input.validate().map_err(ApiError)?;

    let member = member_by_id(&state.pool, &session.member_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::unauthorized)?;

    // Case-insensitive: an e-mail address is not case-sensitive, and asking a
    // member to reproduce the exact casing their account was created with is a
    // trap, not a safety measure.
    if !member.email.eq_ignore_ascii_case(input.email.trim()) {
        return Err(ApiError(contract::ErrorCode::ValidationFailed));
    }

    let deleted = account_delete(&state.pool, &session.member_id, now())
        .await
        .map_err(db_error)?;

    Ok((
        StatusCode::OK,
        Json(DeleteAccountOutput {
            deleted: true,
            stores_archived: deleted.stores_archived,
            memberships_removed: deleted.memberships_removed,
        }),
    ))
}
