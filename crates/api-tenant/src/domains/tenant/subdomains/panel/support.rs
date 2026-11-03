//! Helpers shared by the panel handlers.
//!
//! A panel request names the store with `storeSlug`; the session names the
//! member and `TenantMembership` binds that store to it. Every handler starts
//! from [`context`] and gates on [`guard`], so the tenant is never a value the
//! caller chose.

use axum::http::HeaderMap;
use chrono::{NaiveDateTime, SecondsFormat, Utc};
use domain::session::{TENANT_COOKIE, cookie_value, parse_cookies};
use persistence::tenant::TenantId;

use crate::domains::tenant::support::{
    ApiError, StoreMember, panel_tenant, require_capability, require_member,
};

/// The tenant and the member every panel handler works from.
pub struct PanelContext {
    pub tenant: TenantId,
    pub member: StoreMember,
}

/// Resolves the session cookie and `storeSlug` to the panel context.
///
/// A missing cookie or session is `UNAUTHORIZED`; a slug that names no store,
/// or a member without a membership on it, is `NOT_FOUND` either way.
pub async fn context(
    state: &crate::State,
    headers: &HeaderMap,
    slug: &str,
) -> Result<PanelContext, ApiError> {
    let cookies = parse_cookies(headers.get("cookie").and_then(|value| value.to_str().ok()));
    let token = cookie_value(&cookies, TENANT_COOKIE).ok_or_else(ApiError::unauthorized)?;

    let mut member = require_member(&state.pool, token).await?;
    let tenant = panel_tenant(&state.pool, &mut member, slug).await?;

    Ok(PanelContext { tenant, member })
}

/// Caps the caller at what its role grants.
pub fn guard(ctx: &PanelContext, capability: &str) -> Result<(), ApiError> {
    require_capability(&ctx.member, capability)
}

/// The current UTC instant, the same clock the TS handlers used.
pub fn now() -> NaiveDateTime {
    Utc::now().naive_utc()
}

/// `Timestamp(3)` → RFC 3339 with milliseconds and a trailing `Z`, the shape
/// `Date.toISOString()` produced.
pub fn iso(value: NaiveDateTime) -> String {
    value.and_utc().to_rfc3339_opts(SecondsFormat::Millis, true)
}
