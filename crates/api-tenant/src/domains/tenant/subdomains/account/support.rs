//! Helpers shared by the account handlers.
//!
//! The account surface is member-level: no `storeSlug`, no tenant scope. The
//! session comes from the same `menuza_tenant_sid` cookie the dashboard uses,
//! and `StoreMember.session_id` is already the row digest, so a digest must not
//! be hashed again.

use axum::http::HeaderMap;
use chrono::{NaiveDateTime, Utc};
use domain::session::{TENANT_COOKIE, cookie_value, is_same_origin, parse_cookies, public_host};

use crate::domains::tenant::support::{ApiError, StoreMember, require_member};

/// The current UTC instant, the same clock the TS handlers used.
pub fn now() -> NaiveDateTime {
    Utc::now().naive_utc()
}

/// One request header as text, or `None` when absent or not ASCII.
pub fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

/// The raw tenant session token from the cookie header, if any.
pub fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let cookies = parse_cookies(header(headers, "cookie"));

    cookie_value(&cookies, TENANT_COOKIE).map(str::to_owned)
}

/// Rejects a state-changing request whose `Origin`/`Referer` does not match the
/// host the browser used.
pub fn assert_same_origin(headers: &HeaderMap) -> Result<(), ApiError> {
    let same_origin = is_same_origin(
        header(headers, "origin"),
        header(headers, "referer"),
        public_host(header(headers, "x-forwarded-host"), header(headers, "host")),
    );

    if same_origin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

/// Resolves the tenant session cookie to its member.
pub async fn require_tenant_member(
    state: &crate::State,
    headers: &HeaderMap,
) -> Result<StoreMember, ApiError> {
    let token = cookie_token(headers).ok_or_else(ApiError::unauthorized)?;

    require_member(&state.pool, &token).await
}

/// `Timestamp(3)` → `YYYY-MM-DDTHH:MM:SSZ`, the shape `toPanelTimestamp`
/// produced: second precision, UTC re-attached at the edge.
pub fn to_panel_timestamp(value: NaiveDateTime) -> String {
    value.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}
