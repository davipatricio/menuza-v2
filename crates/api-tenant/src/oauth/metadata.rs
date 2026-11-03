//! `GET /.well-known/oauth-authorization-server` — RFC 8414 metadata.
//!
//! The document must name the public origin, not the loopback this process
//! binds: see `domain::oauth::public_origin` for the forwarded-host rule.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use contract::oauth::OAuthServerMetadata;
use domain::oauth::{PKCE_METHOD, SUPPORTED_OAUTH_SCOPES, public_origin};

use super::support::{METADATA_CACHE, header, json_response, request_host, request_scheme};

/// The authorization-server document.
pub async fn metadata(State(state): State<crate::State>, headers: HeaderMap) -> Response {
    let origin = public_origin(
        &request_host(&headers, &state),
        header(&headers, "x-forwarded-host"),
        header(&headers, "x-forwarded-proto"),
        state.config.trusted_proxy_hops,
        request_scheme(&headers),
    );

    json_response(server_metadata(&origin), &METADATA_CACHE)
}

/// The same document the Bun backend emitted, unchanged.
fn server_metadata(origin: &str) -> OAuthServerMetadata {
    OAuthServerMetadata {
        issuer: origin.to_owned(),
        authorization_endpoint: format!("{origin}/oauth/authorize"),
        token_endpoint: format!("{origin}/oauth/token"),
        revocation_endpoint: format!("{origin}/oauth/revoke"),
        response_types_supported: vec!["code".to_owned()],
        code_challenge_methods_supported: vec![PKCE_METHOD.to_owned()],
        token_endpoint_auth_methods_supported: vec!["none".to_owned()],
        grant_types_supported: vec!["authorization_code".to_owned()],
        scopes_supported: SUPPORTED_OAUTH_SCOPES
            .iter()
            .map(|scope| (*scope).to_owned())
            .collect(),
    }
}
