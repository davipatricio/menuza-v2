//! `POST /oauth/authorize` — the consent page exchanges its session for a code.
//!
//! Authentication comes first: the `menuza_tenant_sid` cookie resolves to a
//! member, and only that member's stores may be granted. The redirect URI must
//! be one the client registered, byte for byte (RFC 6749 §3.1.2.3); an unknown
//! client or a mismatched URI answers a plain error with NO redirect, because
//! that request never proved it is safe to redirect.

use std::collections::HashSet;

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::Response;
use chrono::{Duration, Utc};
use contract::ErrorCode;
use contract::oauth::{OAuthAuthorizeOutput, OAuthAuthorizeRequest, OAuthErrorOutput};
use domain::oauth::{
    DEFAULT_AUTH_CODE_TTL_SECONDS, OAuthError, PKCE_METHOD, hash_oauth_token, new_oauth_secret,
    resolve_requested_scopes,
};
use domain::session::{TENANT_COOKIE, parse_cookies};
use persistence::oauth::{NewOAuthCode, oauth_client_find, oauth_code_insert};
use persistence::tenant::session::memberships_by_member;

use super::support::{CORS, header, json_response, parse_json};
use crate::domains::tenant::support::{ApiError, require_member};

/// Issues an authorization code for the session's member.
pub async fn authorize(State(state): State<crate::State>, request: Request) -> Response {
    let token = parse_cookies(header(request.headers(), "cookie"))
        .get(TENANT_COOKIE)
        .filter(|token| !token.is_empty())
        .cloned();

    let Some(token) = token else {
        return unauthorized("Missing session cookie");
    };

    let member = match require_member(&state.pool, &token).await {
        Ok(member) => member,
        Err(ApiError(ErrorCode::Internal)) => return server_error(),
        Err(_) => return unauthorized("Invalid or expired session"),
    };

    let Some(input) = parse_json::<OAuthAuthorizeRequest>(request, &state).await else {
        return json_response(
            OAuthErrorOutput::new("invalid_request", "Missing or invalid required fields"),
            &[],
        );
    };

    let tenants = match granted_tenant_ids(&state, &member.member_id, &input).await {
        Ok(tenants) => tenants,
        Err(response) => return response,
    };

    let scopes = match resolve_requested_scopes(input.scopes.as_deref()) {
        Ok(scopes) => scopes,
        Err(error) => return refused(&error),
    };

    if let Err(error) = require_client(&state, &input).await {
        return match error {
            ClientError::Refused(error) => refused(&error),
            ClientError::Database => server_error(),
        };
    }

    let code = new_oauth_secret();

    let inserted = oauth_code_insert(
        &state.pool,
        &NewOAuthCode {
            id: uuid::Uuid::new_v4().to_string(),
            code_hash: hash_oauth_token(&code),
            client_id: input.client_id.clone(),
            member_id: member.member_id.clone(),
            code_challenge: input.code_challenge.clone(),
            code_challenge_method: input
                .code_challenge_method
                .clone()
                .unwrap_or_else(|| PKCE_METHOD.to_owned()),
            redirect_uri: input.redirect_uri.clone(),
            scopes,
            tenant_ids: tenants,
            expires_at: Utc::now().naive_utc() + Duration::seconds(DEFAULT_AUTH_CODE_TTL_SECONDS),
        },
    )
    .await;

    if inserted.is_err() {
        return server_error();
    }

    json_response(
        OAuthAuthorizeOutput {
            code,
            redirect_uri: input.redirect_uri,
        },
        &[],
    )
}

/// Why the client check stopped.
enum ClientError {
    Refused(OAuthError),
    Database,
}

/// The requested stores the member actually holds, in request order. A store
/// the member does not belong to is dropped, never refused: the consent screen
/// already showed the member's own list.
async fn granted_tenant_ids(
    state: &crate::State,
    member_id: &str,
    input: &OAuthAuthorizeRequest,
) -> Result<Vec<String>, Response> {
    let requested = input.tenant_ids.clone().unwrap_or_default();

    if requested.is_empty() {
        return Ok(Vec::new());
    }

    let memberships = memberships_by_member(&state.pool, member_id)
        .await
        .map_err(|_| server_error())?;

    let allowed: HashSet<&str> = memberships
        .iter()
        .map(|membership| membership.tenant_id.as_str())
        .collect();

    Ok(requested
        .into_iter()
        .filter(|tenant_id| allowed.contains(tenant_id.as_str()))
        .collect())
}

/// An unregistered client, or a URI it never registered, is refused before any
/// code row exists.
async fn require_client(
    state: &crate::State,
    input: &OAuthAuthorizeRequest,
) -> Result<(), ClientError> {
    let client = oauth_client_find(&state.pool, &input.client_id)
        .await
        .map_err(|_| ClientError::Database)?
        .ok_or(ClientError::Refused(OAuthError::UnknownClient))?;

    if client
        .redirect_uris
        .iter()
        .any(|uri| uri == &input.redirect_uri)
    {
        Ok(())
    } else {
        Err(ClientError::Refused(OAuthError::RedirectUriNotRegistered))
    }
}

fn unauthorized(description: &str) -> Response {
    let mut response = json_response(OAuthErrorOutput::new("unauthorized", description), &[]);

    *response.status_mut() = StatusCode::UNAUTHORIZED;

    response
}

fn refused(error: &OAuthError) -> Response {
    let mut response = json_response(
        OAuthErrorOutput::new("invalid_request", error.to_string()),
        &CORS,
    );

    *response.status_mut() = StatusCode::BAD_REQUEST;

    response
}

fn server_error() -> Response {
    let mut response = json_response(
        OAuthErrorOutput::new("server_error", "Authorization refused"),
        &[],
    );

    *response.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;

    response
}
