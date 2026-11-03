//! OAuth2 rules: scopes, PKCE, token material and the public origin.
//!
//! Ported from `apps/orpc-server/src/auth/oauth.ts` and the `publicOrigin`
//! helper in `apps/tenant/src/oauth.ts`. Nothing here reads a row or builds a
//! response: the handler supplies what was stored and gets a verdict.
//!
//! Digests are the compatibility contract. [`hash_oauth_token`] is the same
//! lowercase-hex SHA-256 `hashSessionToken` produced, so a code or token minted
//! by the Bun backend still matches the row this crate looks up.

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};

/// Authorization codes live ten minutes.
pub const DEFAULT_AUTH_CODE_TTL_SECONDS: i64 = 10 * 60;
/// Access tokens live thirty days.
pub const DEFAULT_ACCESS_TOKEN_TTL_SECONDS: i64 = 30 * 24 * 60 * 60;
/// The only scope this server grants: the member's role decides the rest.
pub const SUPPORTED_OAUTH_SCOPES: [&str; 1] = ["admin"];
/// The only PKCE method accepted.
pub const PKCE_METHOD: &str = "S256";

/// A refused OAuth request. Each message is the `error_description` the TS
/// handler sent, verbatim; a client already displaying them keeps working.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum OAuthError {
    #[error("Unknown OAuth client")]
    UnknownClient,
    #[error("redirect_uri does not match a registered URI")]
    RedirectUriNotRegistered,
    #[error("Unsupported scope: {0}")]
    UnsupportedScope(String),
    #[error("Invalid or expired authorization code")]
    UnknownCode,
    #[error("Client ID mismatch")]
    ClientMismatch,
    #[error("Redirect URI mismatch")]
    RedirectUriMismatch,
    #[error("Authorization code expired")]
    CodeExpired,
    #[error("Invalid PKCE code_verifier")]
    InvalidPkce,
    #[error("Authorization code already used")]
    CodeConsumed,
}

/// sha256, lowercase hex — the `codeHash`, `accessTokenHash` and
/// `refreshTokenHash` columns are this digest.
pub fn hash_oauth_token(token: &str) -> String {
    crate::session::hash_session_token(token)
}

/// Narrows a requested scope list to the supported set.
///
/// An omitted or empty request means `admin`. Anything outside the supported
/// list is refused, never silently dropped, and duplicates collapse in request
/// order.
pub fn resolve_requested_scopes(requested: Option<&[String]>) -> Result<Vec<String>, OAuthError> {
    let Some(requested) = requested.filter(|scopes| !scopes.is_empty()) else {
        return Ok(vec![SUPPORTED_OAUTH_SCOPES[0].to_owned()]);
    };

    let mut accepted: Vec<String> = Vec::new();
    let mut unsupported: Vec<String> = Vec::new();

    for scope in requested {
        if is_oauth_scope(scope) {
            if !accepted.iter().any(|known| known == scope) {
                accepted.push(scope.clone());
            }
        } else {
            unsupported.push(scope.clone());
        }
    }

    if !unsupported.is_empty() {
        return Err(OAuthError::UnsupportedScope(unsupported.join(", ")));
    }

    Ok(accepted)
}

/// Narrows a stored or requested scope string to the supported set.
pub fn is_oauth_scope(value: &str) -> bool {
    SUPPORTED_OAUTH_SCOPES.contains(&value)
}

/// PKCE S256 per RFC 7636: `BASE64URL(SHA256(ASCII(verifier)))` equals the
/// stored challenge. Any method but `S256` fails closed.
pub fn verify_pkce(verifier: &str, code_challenge: &str, method: &str) -> bool {
    method == PKCE_METHOD
        && URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes())) == code_challenge
}

/// An opaque secret: 32 random bytes, base64url without padding — the shape
/// `randomBytes(32).toString("base64url")` produced for codes and tokens.
pub fn new_oauth_secret() -> String {
    let mut bytes = [0_u8; 32];

    bytes[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());

    URL_SAFE_NO_PAD.encode(bytes)
}

/// The origin a remote OAuth client must address.
///
/// Behind the web app's rewrite this process sees its own loopback origin, so
/// the document would advertise `http://127.0.0.1:3002` and discovery would be
/// useless. The public host arrives in `x-forwarded-host`/`x-forwarded-proto`,
/// which is only trusted when the deployment declares trusted hops — the same
/// `TRUSTED_PROXY_HOPS` switch `proxy.ts` used — so a direct caller cannot
/// forge its way into the document.
///
/// `host` is what the request itself addressed and `scheme` the scheme that
/// request used; without a trusted hop they are the advertised origin. The
/// forwarded proto falls back to `https`, never to `http`.
pub fn public_origin(
    host: &str,
    forwarded_host: Option<&str>,
    forwarded_proto: Option<&str>,
    trusted_proxy_hops: u32,
    scheme: &str,
) -> String {
    let forwarded_host = if trusted_proxy_hops > 0 {
        first_value(forwarded_host)
    } else {
        None
    };

    let Some(forwarded_host) = forwarded_host else {
        return format!("{scheme}://{host}");
    };

    let proto = match first_value(forwarded_proto) {
        Some("http") => "http",
        _ => "https",
    };

    format!("{proto}://{forwarded_host}")
}

/// The first comma-separated header value, trimmed; empty is absent.
fn first_value(value: Option<&str>) -> Option<&str> {
    value
        .and_then(|raw| raw.split(',').next())
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_digest_matches_the_session_digest() {
        assert_eq!(
            hash_oauth_token("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            hash_oauth_token("abc"),
            crate::session::hash_session_token("abc")
        );
    }

    #[test]
    fn an_omitted_scope_request_means_admin() {
        assert_eq!(
            resolve_requested_scopes(None).expect("admin"),
            vec!["admin".to_owned()]
        );
        assert_eq!(
            resolve_requested_scopes(Some(&[])).expect("admin"),
            vec!["admin".to_owned()]
        );
    }

    #[test]
    fn scope_requests_collapse_duplicates_in_order() {
        let requested = vec!["admin".to_owned(), "admin".to_owned()];

        assert_eq!(
            resolve_requested_scopes(Some(&requested)).expect("admin"),
            vec!["admin".to_owned()]
        );
    }

    #[test]
    fn unsupported_scopes_are_refused_with_their_names() {
        let requested = vec!["admin".to_owned(), "orders:read".to_owned()];

        assert_eq!(
            resolve_requested_scopes(Some(&requested)),
            Err(OAuthError::UnsupportedScope("orders:read".to_owned()))
        );
        assert_eq!(
            OAuthError::UnsupportedScope("orders:read".to_owned()).to_string(),
            "Unsupported scope: orders:read"
        );
    }

    #[test]
    fn pkce_matches_the_rfc_vector() {
        assert!(verify_pkce(
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            "S256"
        ));
        assert!(!verify_pkce(
            "wrong",
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            "S256"
        ));
        assert!(!verify_pkce(
            "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            "plain"
        ));
    }

    #[test]
    fn secrets_are_32_bytes_of_base64url() {
        let secret = new_oauth_secret();
        let decoded = URL_SAFE_NO_PAD
            .decode(secret.as_bytes())
            .expect("base64url");

        assert_eq!(decoded.len(), 32);
        assert_ne!(secret, new_oauth_secret());
    }

    #[test]
    fn a_direct_request_advertises_its_own_origin() {
        assert_eq!(
            public_origin(
                "127.0.0.1:3002",
                Some("menuza.test"),
                Some("https"),
                0,
                "https"
            ),
            "https://127.0.0.1:3002"
        );
        assert_eq!(
            public_origin("127.0.0.1:3002", None, None, 0, "http"),
            "http://127.0.0.1:3002"
        );
    }

    #[test]
    fn a_trusted_hop_advertises_the_forwarded_origin() {
        assert_eq!(
            public_origin(
                "127.0.0.1:3002",
                Some("menuza.test, proxy"),
                Some("https"),
                1,
                "http"
            ),
            "https://menuza.test"
        );
        assert_eq!(
            public_origin(
                "127.0.0.1:3002",
                Some("menuza.test"),
                Some("http"),
                1,
                "https"
            ),
            "http://menuza.test"
        );
        assert_eq!(
            public_origin(
                "127.0.0.1:3002",
                Some("menuza.test"),
                Some("gopher"),
                1,
                "http"
            ),
            "https://menuza.test"
        );
    }

    #[test]
    fn a_trusted_hop_without_a_forwarded_host_keeps_the_own_origin() {
        assert_eq!(
            public_origin("127.0.0.1:3002", None, Some("https"), 1, "http"),
            "http://127.0.0.1:3002"
        );
    }
}
