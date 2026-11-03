//! OAuth2 wire DTOs, ported from `apps/tenant/src/oauth.ts`.
//!
//! This is a protocol surface, not a REST resource: none of these types derive
//! `utoipa::ToSchema` and no route that carries them reaches the OpenAPI
//! document. Field names are the ones the TS handlers emitted — snake_case for
//! the token and revocation bodies, camelCase for the consent payload.

use serde::{Deserialize, Serialize};

/// The `POST /oauth/authorize` body, posted by the consent page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthAuthorizeRequest {
    pub client_id: String,
    pub redirect_uri: String,
    pub code_challenge: String,
    #[serde(default)]
    pub code_challenge_method: Option<String>,
    #[serde(default)]
    pub tenant_ids: Option<Vec<String>>,
    #[serde(default)]
    pub scopes: Option<Vec<String>>,
}

/// `{ code, redirectUri }` — the consent page's answer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthAuthorizeOutput {
    pub code: String,
    pub redirect_uri: String,
}

/// The `POST /oauth/token` body, form-encoded or JSON.
///
/// `grant_type` is optional here because a missing one is a malformed payload,
/// not an unsupported grant: the handler separates the two errors.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OAuthTokenRequest {
    #[serde(default)]
    pub grant_type: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub code_verifier: Option<String>,
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub redirect_uri: Option<String>,
}

/// The `POST /oauth/revoke` body, form-encoded or JSON.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OAuthRevokeRequest {
    #[serde(default)]
    pub token: Option<String>,
}

/// A token response, snake_case as RFC 6749 §5.1 spells it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenOutput {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub scope: String,
    pub tenant_ids: Vec<String>,
}

/// RFC 6749 §5.2 error body. The strings are protocol constants, not the
/// `contract::ErrorCode` catalog, because OAuth clients switch on these.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthErrorOutput {
    pub error: String,
    pub error_description: String,
}

impl OAuthErrorOutput {
    /// One error and its description.
    pub fn new(error: &str, error_description: impl Into<String>) -> Self {
        Self {
            error: error.to_owned(),
            error_description: error_description.into(),
        }
    }
}

/// RFC 8414 authorization-server metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthServerMetadata {
    pub issuer: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub revocation_endpoint: String,
    pub response_types_supported: Vec<String>,
    pub code_challenge_methods_supported: Vec<String>,
    pub token_endpoint_auth_methods_supported: Vec<String>,
    pub grant_types_supported: Vec<String>,
    pub scopes_supported: Vec<String>,
}
