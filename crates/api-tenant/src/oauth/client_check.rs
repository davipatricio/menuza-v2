//! `GET /oauth/client-check?client_id=…&redirect_uri=…` — does this client own
//! this redirect URI? 204 when it does, 404 when it does not.
//!
//! Exists so the consent page can refuse to render for a URI the client never
//! registered: Cancel navigates to that URI, and an unvalidated one would make
//! the screen a one-click open redirect. No session, no secrets, no body.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Response;

use super::support::empty_response;

/// The two query parameters, both optional so a missing one is the TS's 400.
#[derive(Debug, serde::Deserialize)]
pub struct ClientCheckQuery {
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub redirect_uri: Option<String>,
}

/// Answers whether the client registered this exact redirect URI.
pub async fn client_check(
    State(state): State<crate::State>,
    Query(query): Query<ClientCheckQuery>,
) -> Response {
    let client_id = query.client_id.unwrap_or_default();
    let redirect_uri = query.redirect_uri.unwrap_or_default();

    if client_id.is_empty() || redirect_uri.is_empty() {
        return empty_response(StatusCode::BAD_REQUEST, &[]);
    }

    let registered = persistence::oauth::oauth_client_find(&state.pool, &client_id)
        .await
        .ok()
        .flatten()
        .is_some_and(|client| client.redirect_uris.iter().any(|uri| uri == &redirect_uri));

    if registered {
        empty_response(StatusCode::NO_CONTENT, &[])
    } else {
        empty_response(StatusCode::NOT_FOUND, &[])
    }
}
