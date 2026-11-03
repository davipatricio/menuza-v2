//! What a request proves: which tenant it claims, which session it carries and
//! whether it came from an internal caller.
//!
//! Provenance only. `TenantScope` carries the resolved header value as a plain
//! string because `persistence` owns the `TenantId` type; this crate must not
//! depend on it, so parsing stays at the handler boundary.

use std::net::{IpAddr, SocketAddr};

use axum::Json;
use axum::extract::{ConnectInfo, FromRequestParts};
use axum::http::StatusCode;
use axum::http::header::COOKIE;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use serde_json::json;

use contract::{ApiErrorBody, ErrorCode};

use crate::AppState;

/// Tenant scope header, set by the proxy that resolved the request host.
pub const TENANT_HEADER: &str = "x-menuza-tenant-id";
/// Shared secret header for server-to-server calls.
pub const INTERNAL_HEADER: &str = "x-menuza-internal-token";
/// Tenant dashboard session cookie.
pub const TENANT_COOKIE: &str = "menuza_tenant_sid";
/// Commerce storefront session cookie.
pub const COMMERCE_COOKIE: &str = "menuza_commerce_sid";

/// Every rejection is the contract envelope: `status()` from the code, its
/// catalog message, and the wire string echoed in `data`.
type Rejection = (StatusCode, Json<ApiErrorBody>);

fn rejection(code: ErrorCode) -> Rejection {
    let wire = serde_json::to_value(code).unwrap_or_default();
    let status = StatusCode::from_u16(code.status()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    (
        status,
        Json(ApiErrorBody::with_data(code, json!({ "code": wire }))),
    )
}

/// Raw `menuza_tenant_sid` cookie value, exactly as the browser sent it. Decoding
/// is not this crate's job: the raw value is the token.
pub struct SessionToken(pub String);

impl SessionToken {
    /// sha256, lowercase hex. The session row id is this digest.
    pub fn digest(&self) -> String {
        domain::session::hash_session_token(&self.0)
    }
}

impl<S: AppState> FromRequestParts<S> for SessionToken {
    type Rejection = Rejection;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        match session_cookie_value(parts, TENANT_COOKIE) {
            Some(token) => Ok(Self(token)),
            None => Err(rejection(ErrorCode::Unauthorized)),
        }
    }
}

/// Raw `menuza_commerce_sid` cookie value, exactly as the browser sent it. The
/// commerce API authenticates with its own cookie, so this is a sibling of
/// [`SessionToken`], never a substitute: a tenant cookie proves nothing here.
pub struct CommerceSession(pub String);

impl CommerceSession {
    /// sha256, lowercase hex. The session row id is this digest.
    pub fn digest(&self) -> String {
        domain::session::hash_session_token(&self.0)
    }
}

impl<S: AppState> FromRequestParts<S> for CommerceSession {
    type Rejection = Rejection;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        match session_cookie_value(parts, COMMERCE_COOKIE) {
            Some(token) => Ok(Self(token)),
            None => Err(rejection(ErrorCode::Unauthorized)),
        }
    }
}

/// The value of the named cookie, or `None` when the request lacks it. A blank
/// value is no value, and a different cookie name never matches.
fn session_cookie_value(parts: &Parts, name: &str) -> Option<String> {
    let header = parts.headers.get(COOKIE).and_then(|raw| raw.to_str().ok());

    header?
        .split(';')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| key.trim() == name)
        .map(|(_, value)| value.trim())
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// Possession of the shared secret is the authorization: extracting this unit
/// is the only way to obtain it, so a handler cannot forget the check.
pub struct InternalToken;

impl<S: AppState> FromRequestParts<S> for InternalToken {
    type Rejection = Rejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // Fails closed: no configured secret means no internal caller. `Config`
        // is the only place a key is read, so this is not an environment read.
        let Some(expected) = state.config().internal_api_secret.as_deref() else {
            return Err(rejection(ErrorCode::Internal));
        };

        let presented = parts
            .headers
            .get(INTERNAL_HEADER)
            .and_then(|raw| raw.to_str().ok());

        match presented {
            Some(presented) if tokens_match(expected, presented) => Ok(Self),
            _ => Err(rejection(ErrorCode::Unauthorized)),
        }
    }
}

/// Proof that the tenant header arrived from a trusted hop. The value stays a
/// plain string: `persistence` owns `TenantId`, this extractor only proves
/// provenance.
#[derive(Debug, Clone)]
pub struct TenantScope {
    tenant_id: Option<String>,
}

impl TenantScope {
    /// The tenant id the request claims, or `None` when it claimed none.
    pub fn tenant_id(&self) -> Option<&str> {
        self.tenant_id.as_deref()
    }
}

impl<S: AppState> FromRequestParts<S> for TenantScope {
    type Rejection = Rejection;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(TENANT_HEADER)
            .and_then(|raw| raw.to_str().ok());
        // Without `ConnectInfo` the peer is unknown, which is never loopback.
        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ConnectInfo(peer)| *peer);
        let forwarded_host = parts
            .headers
            .get("x-forwarded-host")
            .and_then(|raw| raw.to_str().ok());
        let config = state.config();
        let trusted = peer_is_trusted(
            peer,
            &config.trusted_proxy_ips,
            config.trusted_proxy_hops,
            forwarded_host,
        );

        match resolve_tenant_scope(header, trusted) {
            Ok(tenant_id) => Ok(Self { tenant_id }),
            Err(error) => Err(error.rejection()),
        }
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TenancyError {
    #[error("tenant header from an untrusted hop")]
    UntrustedHop,
    #[error("tenant id is empty")]
    Empty,
}

impl TenancyError {
    fn rejection(&self) -> Rejection {
        rejection(match self {
            Self::UntrustedHop => ErrorCode::Forbidden,
            Self::Empty => ErrorCode::TenantNotResolved,
        })
    }
}

impl IntoResponse for TenancyError {
    fn into_response(self) -> Response {
        self.rejection().into_response()
    }
}

/// A browser that reaches the binary directly is never trusted, and a forwarded
/// header on its own proves nothing: the peer must be loopback, or a listed
/// proxy with hops configured and a forwarded host present.
pub fn peer_is_trusted(
    peer: Option<SocketAddr>,
    trusted_proxy_ips: &[IpAddr],
    trusted_proxy_hops: u32,
    forwarded_host: Option<&str>,
) -> bool {
    let Some(peer) = peer else {
        return false;
    };

    if peer.ip().is_loopback() {
        return true;
    }

    trusted_proxy_hops > 0
        && trusted_proxy_ips.contains(&peer.ip())
        && forwarded_host.is_some_and(|host| !host.trim().is_empty())
}

/// Resolves the tenant header. An absent or blank header claims nothing; a
/// claim from an untrusted hop is refused; a whitespace-only claim over a
/// trusted hop is an empty id.
pub fn resolve_tenant_scope(
    header: Option<&str>,
    trusted: bool,
) -> Result<Option<String>, TenancyError> {
    let Some(raw) = header else {
        return Ok(None);
    };

    if raw.is_empty() {
        return Ok(None);
    }

    if !trusted {
        return Err(TenancyError::UntrustedHop);
    }

    let value = raw.trim();

    if value.is_empty() {
        return Err(TenancyError::Empty);
    }

    Ok(Some(value.to_owned()))
}

/// Constant time on content: the loop always walks the longer input, so a wrong
/// length still costs a full pass. An empty side never matches.
pub fn tokens_match(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());

    if a.is_empty() || b.is_empty() {
        return false;
    }

    let mut diff = u8::from(a.len() != b.len());

    for index in 0..a.len().max(b.len()) {
        let left = a.get(index).copied().unwrap_or(0);
        let right = b.get(index).copied().unwrap_or(0);
        diff |= left ^ right;
    }

    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn peer(raw: &str) -> Option<SocketAddr> {
        Some(raw.parse().expect("peer address"))
    }

    #[test]
    fn shell_tenant_header_from_an_untrusted_hop_is_rejected() {
        assert_eq!(
            resolve_tenant_scope(Some("t1"), false),
            Err(TenancyError::UntrustedHop)
        );
    }

    #[test]
    fn shell_tenant_header_from_a_trusted_hop_is_accepted() {
        assert_eq!(
            resolve_tenant_scope(Some(" t1 "), true),
            Ok(Some("t1".to_owned()))
        );
    }

    #[test]
    fn shell_blank_tenant_header_is_none() {
        assert_eq!(resolve_tenant_scope(None, true), Ok(None));
        assert_eq!(resolve_tenant_scope(Some(""), false), Ok(None));
        assert_eq!(
            resolve_tenant_scope(Some("   "), true),
            Err(TenancyError::Empty)
        );
    }

    #[test]
    fn shell_tokens_match() {
        assert!(tokens_match("secret", "secret"));
        assert!(!tokens_match("secret", "secrey"));
        assert!(!tokens_match("", ""));
        assert!(!tokens_match("secret", ""));
        assert!(!tokens_match("", "secret"));
        assert!(!tokens_match("secret", "secret-longer"));
        assert!(!tokens_match("secret-longer", "secret"));
        assert!(!tokens_match("secret", "secre"));
    }

    #[test]
    fn shell_peer_is_trusted() {
        assert!(peer_is_trusted(peer("127.0.0.1:5000"), &[], 0, None));
        assert!(peer_is_trusted(peer("[::1]:5000"), &[], 0, None));
        assert!(!peer_is_trusted(
            None,
            &[IpAddr::from([127, 0, 0, 1])],
            9,
            Some("menuza.localhost")
        ));
    }

    #[test]
    fn shell_forwarded_host_trusts_only_a_listed_proxy() {
        let listed = [IpAddr::from([10, 0, 0, 5])];

        assert!(peer_is_trusted(
            peer("10.0.0.5:41000"),
            &listed,
            1,
            Some("menuza.localhost")
        ));
        assert!(!peer_is_trusted(
            peer("10.0.0.5:41000"),
            &[IpAddr::from([10, 0, 0, 6])],
            1,
            Some("menuza.localhost")
        ));
        assert!(!peer_is_trusted(
            peer("10.0.0.5:41000"),
            &listed,
            0,
            Some("menuza.localhost")
        ));
        assert!(!peer_is_trusted(peer("10.0.0.5:41000"), &listed, 1, None));
        assert!(!peer_is_trusted(
            peer("10.0.0.5:41000"),
            &listed,
            1,
            Some("  ")
        ));
        assert!(!peer_is_trusted(
            peer("10.0.0.5:41000"),
            &[],
            3,
            Some("menuza.localhost")
        ));
    }

    #[test]
    fn shell_tenancy_error_maps_to_contract_codes() {
        assert_eq!(
            TenancyError::UntrustedHop.into_response().status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            TenancyError::Empty.into_response().status(),
            StatusCode::BAD_REQUEST
        );
    }

    #[tokio::test]
    async fn shell_rejection_body_is_the_contract_envelope() {
        let response = rejection(ErrorCode::Unauthorized).into_response();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let body = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .expect("body");
        let body_json: serde_json::Value = serde_json::from_slice(&body).expect("json");

        assert_eq!(
            body_json,
            json!({
                "code": "UNAUTHORIZED",
                "message": ErrorCode::Unauthorized.message(),
                "data": { "code": "UNAUTHORIZED" },
            })
        );
    }

    /// No database is opened: the extractors only read `Parts`.
    #[derive(Clone)]
    struct TestState {
        pool: sqlx::PgPool,
        config: crate::Config,
    }

    impl AppState for TestState {
        fn pool(&self) -> &sqlx::PgPool {
            &self.pool
        }

        fn config(&self) -> &crate::Config {
            &self.config
        }
    }

    fn test_state() -> TestState {
        let mut map = std::collections::HashMap::new();
        map.insert(
            "DATABASE_URL".to_owned(),
            "postgres://menuza@127.0.0.1/menuza".to_owned(),
        );
        let config = crate::Config::from_map(&map, 3001).expect("config");
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://menuza@127.0.0.1/menuza")
            .expect("lazy pool");

        TestState { pool, config }
    }

    fn parts(cookie_header: Option<&str>) -> Parts {
        let mut builder = axum::http::Request::builder();

        if let Some(raw) = cookie_header {
            builder = builder.header(COOKIE, raw);
        }

        builder.body(()).expect("request").into_parts().0
    }

    #[tokio::test]
    async fn shell_tenant_extractor_ignores_the_commerce_cookie() {
        let state = test_state();

        let mut commerce_only = parts(Some("menuza_commerce_sid=token"));
        assert!(
            SessionToken::from_request_parts(&mut commerce_only, &state)
                .await
                .is_err()
        );

        let mut tenant = parts(Some("menuza_commerce_sid=other; menuza_tenant_sid=token"));
        let extracted = SessionToken::from_request_parts(&mut tenant, &state)
            .await
            .expect("tenant cookie");
        assert_eq!(extracted.0, "token");
    }

    #[tokio::test]
    async fn shell_commerce_extractor_ignores_the_tenant_cookie() {
        let state = test_state();

        let mut tenant_only = parts(Some("menuza_tenant_sid=token"));
        assert!(
            CommerceSession::from_request_parts(&mut tenant_only, &state)
                .await
                .is_err()
        );

        let mut commerce = parts(Some("menuza_tenant_sid=other; menuza_commerce_sid=token"));
        let extracted = CommerceSession::from_request_parts(&mut commerce, &state)
            .await
            .expect("commerce cookie");
        assert_eq!(extracted.0, "token");
    }

    #[test]
    fn shell_both_extractors_digest_identically() {
        assert_eq!(
            SessionToken("token".to_owned()).digest(),
            CommerceSession("token".to_owned()).digest()
        );
        assert_eq!(
            CommerceSession("token".to_owned()).digest(),
            domain::session::hash_session_token("token")
        );
    }

    #[tokio::test]
    async fn shell_missing_commerce_cookie_is_the_unauthenticated_envelope() {
        let state = test_state();
        let mut empty = parts(Some("menuza_tenant_sid=token"));

        let rejection = match CommerceSession::from_request_parts(&mut empty, &state).await {
            Err(rejection) => rejection,
            Ok(_) => panic!("a tenant cookie must not satisfy the commerce extractor"),
        };
        let response = rejection.into_response();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let body = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .expect("body");
        let body_json: serde_json::Value = serde_json::from_slice(&body).expect("json");

        assert_eq!(
            body_json,
            json!({
                "code": "UNAUTHORIZED",
                "message": ErrorCode::Unauthorized.message(),
                "data": { "code": "UNAUTHORIZED" },
            })
        );
    }
}
