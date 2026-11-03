//! `POST /session/logout` — revoke the current row and clear the cookie.
//!
//! Idempotent: a missing or unknown token is not an error, but the cookie is
//! always cleared so a stale or tampered value cannot linger.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use contract::tenant::session::LogoutOutput;
use domain::session::hash_session_token;
use persistence::tenant::session::session_revoke;

use super::support::{clearing_cookie, cookie_token, json_with_cookie, now};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    post,
    path = "/session/logout",
    operation_id = "logoutTenantSession",
    tag = "session",
    responses(
        (status = 200, body = LogoutOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn logout(
    State(state): State<crate::State>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if let Some(token) = cookie_token(&headers) {
        let digest = hash_session_token(&token);

        session_revoke(&state.pool, &digest, now())
            .await
            .map_err(db_error)?;
    }

    json_with_cookie(&clearing_cookie(&state), LogoutOutput { success: true })
}
