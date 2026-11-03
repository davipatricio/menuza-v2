//! Helpers shared by the OAuth2 handlers: response headers, body parsing and
//! the origin the metadata document advertises.
//!
//! The metadata, token and revoke answers carry `Access-Control-Allow-Origin: *`:
//! remote MCP clients call them from their own origin, which is what the TS
//! handlers allowed too. `client-check` and `authorize` serve the consent page
//! on the web app's own origin and add no CORS header, exactly as before.

use axum::Json;
use axum::extract::{FromRequest, Request};
use axum::http::header::HeaderName;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Serialize;

const CORS_ORIGIN: (&str, &str) = ("access-control-allow-origin", "*");

/// `Access-Control-Allow-Origin` alone.
pub const CORS: [(&str, &str); 1] = [CORS_ORIGIN];
/// A token answer must not be cached.
pub const NO_STORE: [(&str, &str); 2] = [CORS_ORIGIN, ("cache-control", "no-store")];
/// The successful token answer, with the legacy `Pragma: no-cache`.
pub const TOKEN_CACHE: [(&str, &str); 3] = [
    CORS_ORIGIN,
    ("cache-control", "no-store"),
    ("pragma", "no-cache"),
];
/// Discovery is public and may be cached for an hour.
pub const METADATA_CACHE: [(&str, &str); 2] =
    [CORS_ORIGIN, ("cache-control", "public, max-age=3600")];
const PREFLIGHT: [(&str, &str); 3] = [
    CORS_ORIGIN,
    ("access-control-allow-methods", "GET, POST, OPTIONS"),
    ("access-control-allow-headers", "*"),
];

/// One request header as text, or `None` when absent or not ASCII.
pub fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

/// The host the client addressed: the `Host` header, or the configured bind
/// address when an HTTP/1.0 caller sent none.
pub fn request_host(headers: &HeaderMap, state: &crate::State) -> String {
    domain::session::public_host(None, header(headers, "host"))
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{}:{}", state.config.host, state.config.port))
}

/// The scheme the request itself used: what the reverse proxy forwarded, or
/// `http` when it forwarded nothing.
pub fn request_scheme(headers: &HeaderMap) -> &'static str {
    match header(headers, "x-forwarded-proto") {
        Some("https") => "https",
        _ => "http",
    }
}

/// A JSON answer with the given headers.
pub fn json_response<T: Serialize>(body: T, headers: &[(&'static str, &'static str)]) -> Response {
    with_headers(Json(body).into_response(), headers)
}

/// An empty answer with the given headers.
pub fn empty_response(status: StatusCode, headers: &[(&'static str, &'static str)]) -> Response {
    with_headers(status.into_response(), headers)
}

/// The CORS preflight every browser-callable OAuth route answers.
pub async fn preflight() -> Response {
    empty_response(StatusCode::NO_CONTENT, &PREFLIGHT)
}

/// Parses a form-encoded or JSON body the way the TS handlers did: a JSON
/// `Content-Type` selects JSON, anything else is read as a form. A body that
/// does not parse is `None`, never a rejection.
pub async fn parse_body<T>(request: Request, state: &crate::State) -> Option<T>
where
    T: serde::de::DeserializeOwned,
{
    let is_json = header(request.headers(), "content-type")
        .is_some_and(|value| value.contains("application/json"));

    if is_json {
        Json::<T>::from_request(request, state)
            .await
            .ok()
            .map(|Json(body)| body)
    } else {
        axum::Form::<T>::from_request(request, state)
            .await
            .ok()
            .map(|axum::Form(body)| body)
    }
}

/// Parses a JSON body; the consent endpoint takes JSON only.
pub async fn parse_json<T>(request: Request, state: &crate::State) -> Option<T>
where
    T: serde::de::DeserializeOwned,
{
    Json::<T>::from_request(request, state)
        .await
        .ok()
        .map(|Json(body)| body)
}

/// Inserts the static headers, overwriting whatever the body set.
fn with_headers(mut response: Response, headers: &[(&'static str, &'static str)]) -> Response {
    let map = response.headers_mut();

    for (name, value) in headers {
        map.insert(
            HeaderName::from_static(name),
            HeaderValue::from_static(value),
        );
    }

    response
}
