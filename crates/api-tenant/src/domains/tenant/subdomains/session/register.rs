//! `POST /session/register` — create a management account and its session.
//!
//! The `Member` and the first `Session` are written in one transaction, so the
//! next dashboard route is authenticated. A duplicate e-mail is the generic
//! `CONFLICT`, never "already registered": the endpoint must not confirm which
//! addresses have accounts.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use contract::ErrorCode;
use contract::tenant::session::{LoginOutput, RegisterInput};
use domain::password::hash_password;
use persistence::tenant::session::{NewMember, member_by_email, register_member_with_session};

use super::support::{assert_same_origin, json_with_cookie, now, open_session, tenant_cookie};
use crate::domains::tenant::support::{ApiError, db_error};

/// A concurrent signup can race past the pre-check and land on the unique
/// index; any duplicate-key failure is presented as the same conflict.
fn is_duplicate(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|error| error.code())
        .as_deref()
        == Some("23505")
}

#[utoipa::path(
    post,
    path = "/session/register",
    operation_id = "registerTenantAccount",
    tag = "session",
    request_body = RegisterInput,
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
pub async fn register(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Json(input): Json<RegisterInput>,
) -> Result<Response, ApiError> {
    assert_same_origin(&headers)?;
    input.validate().map_err(ApiError)?;

    let email = input.normalized_email();

    // Hash before the existence check: hashing is the slow step, so skipping it
    // for a known e-mail would leak account existence through response time.
    let password_hash =
        hash_password(&input.password).map_err(|_| ApiError(ErrorCode::Internal))?;

    if member_by_email(&state.pool, &email)
        .await
        .map_err(db_error)?
        .is_some()
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let now = now();
    let member_id = uuid::Uuid::new_v4().to_string();
    let (token, session) = open_session(&member_id, now);

    let member = NewMember {
        id: member_id.clone(),
        email,
        name: input.normalized_name().to_owned(),
        password_hash,
        birthdate: input
            .birthdate_at_midnight()
            .ok_or(ApiError(ErrorCode::ValidationFailed))?,
        updated_at: now,
    };

    if let Err(error) = register_member_with_session(&state.pool, &member, &session).await {
        return Err(if is_duplicate(&error) {
            ApiError(ErrorCode::Conflict)
        } else {
            db_error(error)
        });
    }

    let output = LoginOutput {
        member: contract::tenant::session::SessionMember {
            id: member_id,
            email: member.email.clone(),
            name: Some(member.name.clone()),
            kind: contract::tenant::session::MemberKind::Human,
        },
        memberships: Vec::new(),
    };

    json_with_cookie(&tenant_cookie(&state, &token), output)
}
