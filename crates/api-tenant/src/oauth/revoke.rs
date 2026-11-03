//! `POST /oauth/revoke` — RFC 7009 revocation of a bearer token.
//!
//! Idempotent: an unknown, already-revoked or absent token is a 200, and a body
//! that does not parse is also a 200. The client learns nothing about which
//! token values exist.

use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::Response;
use chrono::Utc;
use contract::oauth::OAuthRevokeRequest;
use domain::oauth::hash_oauth_token;
use persistence::oauth::oauth_token_revoke;

use super::support::{CORS, empty_response, parse_body};

/// Revokes the token in the body, if there is one.
pub async fn revoke(State(state): State<crate::State>, request: Request) -> Response {
    let token = parse_body::<OAuthRevokeRequest>(request, &state)
        .await
        .and_then(|params| params.token)
        .filter(|token| !token.is_empty());

    if let Some(token) = token {
        let revoked = oauth_token_revoke(
            &state.pool,
            &hash_oauth_token(&token),
            Utc::now().naive_utc(),
        )
        .await;

        if revoked.is_err() {
            return empty_response(StatusCode::INTERNAL_SERVER_ERROR, &CORS);
        }
    }

    empty_response(StatusCode::OK, &CORS)
}
