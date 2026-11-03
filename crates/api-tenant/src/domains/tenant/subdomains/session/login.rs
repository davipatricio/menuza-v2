//! `POST /session/login` — authenticate and open the management session.
//!
//! A missing member and a wrong password are indistinguishable: both answer the
//! same `UNAUTHORIZED`, and a null `passwordHash` fails closed. The raw token is
//! handed to the client in the cookie; only its digest is stored.

use axum::Json;
use axum::extract::State;
use axum::response::Response;
use contract::tenant::session::{LoginInput, LoginOutput};
use domain::password::verify_password;
use persistence::tenant::session::{member_by_email, session_create};

use super::support::{
    json_with_cookie, load_memberships, now, open_session, tenant_cookie, to_session_member,
};
use crate::domains::tenant::support::{ApiError, db_error};

#[utoipa::path(
    post,
    path = "/session/login",
    operation_id = "loginTenantSession",
    tag = "session",
    request_body = LoginInput,
    responses(
        (status = 200, body = LoginOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn login(
    State(state): State<crate::State>,
    Json(input): Json<LoginInput>,
) -> Result<Response, ApiError> {
    input.validate().map_err(ApiError)?;

    let email = input.email.trim().to_lowercase();
    let member = member_by_email(&state.pool, &email)
        .await
        .map_err(db_error)?;

    let password_ok = member
        .as_ref()
        .is_some_and(|member| verify_password(&input.password, member.password_hash.as_deref()));

    let Some(member) = member.filter(|_| password_ok) else {
        return Err(ApiError::unauthorized());
    };

    let now = now();
    let (token, session) = open_session(&member.id, now);

    session_create(&state.pool, &session)
        .await
        .map_err(db_error)?;

    let output = LoginOutput {
        member: to_session_member(&member),
        memberships: load_memberships(&state.pool, &member.id).await?,
    };

    json_with_cookie(&tenant_cookie(&state, &token), output)
}
