//! `POST /oauth/token` — exchange a PKCE authorization code for a bearer token.
//!
//! The exchange validates before it consumes: a wrong verifier must not burn
//! the code, or one typo would force the user through consent again. The delete
//! that follows is the compare-and-swap that makes the code single-use.

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::Response;
use chrono::{Duration, Utc};
use contract::oauth::{OAuthErrorOutput, OAuthTokenOutput, OAuthTokenRequest};
use domain::oauth::{
    DEFAULT_ACCESS_TOKEN_TTL_SECONDS, OAuthError, hash_oauth_token, new_oauth_secret, verify_pkce,
};
use persistence::oauth::{NewOAuthToken, oauth_code_consume, oauth_code_find, oauth_token_insert};

use super::support::{NO_STORE, TOKEN_CACHE, json_response, parse_body};

/// Why an exchange stopped: a rule the client can fix, or a failed read/write.
enum ExchangeError {
    Refused(OAuthError),
    Database,
}

/// The token endpoint.
pub async fn token(State(state): State<crate::State>, request: Request) -> Response {
    let Some(params) = parse_body::<OAuthTokenRequest>(request, &state).await else {
        return invalid_request("Invalid request payload");
    };

    let Some(grant_type) = params.grant_type.as_deref() else {
        return invalid_request("Invalid request payload");
    };

    if grant_type != "authorization_code" {
        return error_response(
            StatusCode::BAD_REQUEST,
            "unsupported_grant_type",
            "Only grant_type=authorization_code is supported",
        );
    }

    let (Some(code), Some(verifier), Some(client_id)) = (
        non_empty(params.code.as_deref()),
        non_empty(params.code_verifier.as_deref()),
        non_empty(params.client_id.as_deref()),
    ) else {
        return invalid_request("code, code_verifier, and client_id are required");
    };

    let redirect_uri = non_empty(params.redirect_uri.as_deref());

    match exchange(&state, code, verifier, client_id, redirect_uri).await {
        Ok(output) => json_response(output, &TOKEN_CACHE),
        Err(ExchangeError::Refused(error)) => {
            error_response(StatusCode::BAD_REQUEST, "invalid_grant", &error.to_string())
        }
        // The TS catch-all sent the thrown message; here a database failure is
        // never rebroadcast, so the answer stays generic.
        Err(ExchangeError::Database) => error_response(
            StatusCode::BAD_REQUEST,
            "invalid_grant",
            "Token exchange failed",
        ),
    }
}

async fn exchange(
    state: &crate::State,
    code: &str,
    verifier: &str,
    client_id: &str,
    redirect_uri: Option<&str>,
) -> Result<OAuthTokenOutput, ExchangeError> {
    let stored = oauth_code_find(&state.pool, &hash_oauth_token(code))
        .await
        .map_err(|_| ExchangeError::Database)?
        .ok_or(ExchangeError::Refused(OAuthError::UnknownCode))?;

    if stored.client_id != client_id {
        return Err(ExchangeError::Refused(OAuthError::ClientMismatch));
    }

    if redirect_uri.is_some_and(|uri| stored.redirect_uri != uri) {
        return Err(ExchangeError::Refused(OAuthError::RedirectUriMismatch));
    }

    let now = Utc::now().naive_utc();

    if stored.expires_at <= now {
        return Err(ExchangeError::Refused(OAuthError::CodeExpired));
    }

    if !verify_pkce(
        verifier,
        &stored.code_challenge,
        &stored.code_challenge_method,
    ) {
        return Err(ExchangeError::Refused(OAuthError::InvalidPkce));
    }

    if !oauth_code_consume(&state.pool, &stored.id)
        .await
        .map_err(|_| ExchangeError::Database)?
    {
        return Err(ExchangeError::Refused(OAuthError::CodeConsumed));
    }

    let access_token = new_oauth_secret();
    let expires_in = DEFAULT_ACCESS_TOKEN_TTL_SECONDS;

    oauth_token_insert(
        &state.pool,
        &NewOAuthToken {
            id: uuid::Uuid::new_v4().to_string(),
            access_token_hash: hash_oauth_token(&access_token),
            client_id: stored.client_id.clone(),
            member_id: stored.member_id.clone(),
            scopes: stored.scopes.clone(),
            tenant_ids: stored.tenant_ids.clone(),
            expires_at: now + Duration::seconds(expires_in),
        },
    )
    .await
    .map_err(|_| ExchangeError::Database)?;

    Ok(OAuthTokenOutput {
        access_token,
        token_type: "Bearer".to_owned(),
        expires_in,
        scope: stored.scopes.join(" "),
        tenant_ids: stored.tenant_ids,
    })
}

/// A missing field and an empty one are the same refusal, as in the TS.
fn non_empty(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.is_empty())
}

fn invalid_request(description: &str) -> Response {
    error_response(StatusCode::BAD_REQUEST, "invalid_request", description)
}

fn error_response(status: StatusCode, error: &str, description: &str) -> Response {
    let mut response = json_response(OAuthErrorOutput::new(error, description), &NO_STORE);

    *response.status_mut() = status;

    response
}
