//! `GET /.well-known/oauth-authorization-server` — RFC 8414 metadata.
//!
//! The document must name the public origin, not the loopback this process
//! binds: see `domain::oauth::public_origin` for the forwarded-host rule.

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::Response;
use contract::oauth::OAuthServerMetadata;
use domain::oauth::{PKCE_METHOD, SUPPORTED_OAUTH_SCOPES, public_origin};
use menuza_http::PeerAddr;
use menuza_http::extract::peer_is_trusted;

use super::support::{METADATA_CACHE, header, json_response, request_host, request_scheme};

/// The authorization-server document.
pub async fn metadata(
    State(state): State<crate::State>,
    PeerAddr(peer): PeerAddr,
    headers: HeaderMap,
) -> Response {
    let forwarded_host = header(&headers, "x-forwarded-host");
    let trusted = peer_is_trusted(
        peer,
        &state.config.trusted_proxy_ips,
        state.config.trusted_proxy_hops,
        forwarded_host,
    );
    // Only honor `x-forwarded-host` when the socket peer itself is loopback or a
    // listed proxy IP; otherwise a direct caller could poison the 1-hour public
    // discovery cache with an attacker origin.
    let effective_hops = if trusted {
        state.config.trusted_proxy_hops.max(1)
    } else {
        0
    };

    let origin = public_origin(
        &request_host(&headers, &state),
        forwarded_host,
        header(&headers, "x-forwarded-proto"),
        effective_hops,
        if trusted {
            request_scheme(&headers)
        } else {
            "http"
        },
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
