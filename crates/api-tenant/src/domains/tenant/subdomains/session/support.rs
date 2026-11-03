//! Helpers shared by the session handlers.
//!
//! The bearer session is the `menuza_tenant_sid` cookie. The cookie value is the
//! raw token; the row is keyed by its sha256 digest, so hashing happens once,
//! inside [`open_session`] or at the `require_member` lookup. The tenant-wide
//! `require_member` already enforces revocation, the absolute expiry and the
//! 24-hour idle window.

use axum::Json;
use axum::http::{HeaderMap, HeaderValue, header};
use axum::response::{IntoResponse, Response};
use chrono::{Duration, NaiveDateTime, Utc};
use contract::ErrorCode;
use contract::tenant::session::{
    MemberKind, Onboarding, OnboardingPersona, OnboardingReferral, OnboardingSegment,
    SessionMember, SessionMembership, TenantRole,
};
use domain::session::{
    SESSION_TTL_SECONDS, TENANT_COOKIE, clear_cookie, cookie_value, is_same_origin,
    new_session_token, parse_cookies, public_host, session_cookie,
};
use persistence::tenant::session::{
    MemberRow, NewSession, OnboardingRow, memberships_by_member, onboarding_by_member,
};
use sqlx::PgPool;

use crate::domains::tenant::support::{ApiError, StoreMember, db_error, require_member};

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

/// `Secure` would break local HTTP development; production is HTTPS-only.
pub fn secure(state: &crate::State) -> bool {
    state.config.env == menuza_http::Env::Production
}

/// Rejects a state-changing request whose `Origin`/`Referer` does not match the
/// host the browser used. A non-browser caller that sends neither is allowed.
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

/// Mints a raw token and the row to persist for it. The raw token is the cookie
/// value; the row key is the digest.
pub fn open_session(member_id: &str, now: NaiveDateTime) -> (String, NewSession) {
    let token = new_session_token();

    let session = NewSession {
        digest: domain::session::hash_session_token(&token),
        member_id: member_id.to_owned(),
        namespace: "tenant".to_owned(),
        expires_at: now + Duration::seconds(SESSION_TTL_SECONDS),
        last_used_at: now,
    };

    (token, session)
}

/// The `Set-Cookie` value the login and registration handlers append.
pub fn tenant_cookie(state: &crate::State, token: &str) -> String {
    session_cookie(TENANT_COOKIE, token, SESSION_TTL_SECONDS, secure(state))
}

/// The clearing cookie logout always sends.
pub fn clearing_cookie(state: &crate::State) -> String {
    clear_cookie(TENANT_COOKIE, secure(state))
}

/// A JSON body with the session cookie attached.
pub fn json_with_cookie<T: serde::Serialize>(cookie: &str, body: T) -> Result<Response, ApiError> {
    let mut response = Json(body).into_response();
    let value = HeaderValue::from_str(cookie).map_err(|_| ApiError(ErrorCode::Internal))?;

    response.headers_mut().insert(header::SET_COOKIE, value);

    Ok(response)
}

/// The stored member as the session payload carries it. An unknown `kind` is a
/// human, the least surprising fallback the TS guard used.
pub fn to_session_member(member: &MemberRow) -> SessionMember {
    SessionMember {
        id: member.id.clone(),
        email: member.email.clone(),
        name: member.name.clone(),
        kind: match member.kind.as_str() {
            "bot" => MemberKind::Bot,
            _ => MemberKind::Human,
        },
    }
}

/// Memberships of a member, with unknown roles narrowed to `staff`.
pub async fn load_memberships(
    pool: &PgPool,
    member_id: &str,
) -> Result<Vec<SessionMembership>, ApiError> {
    let rows = memberships_by_member(pool, member_id)
        .await
        .map_err(db_error)?;

    Ok(rows
        .into_iter()
        .map(|row| SessionMembership {
            tenant_id: row.tenant_id,
            tenant_slug: row.tenant_slug,
            tenant_name: row.tenant_name,
            role: match row.role.as_str() {
                "owner" => TenantRole::Owner,
                "admin" => TenantRole::Admin,
                _ => TenantRole::Staff,
            },
        })
        .collect())
}

/// The member's onboarding answers, or `null`. A hand-edited row whose persona
/// is out of contract reads as unanswered, exactly like the TS `safeParse`.
pub async fn load_onboarding(
    pool: &PgPool,
    member_id: &str,
) -> Result<Option<Onboarding>, ApiError> {
    let row = onboarding_by_member(pool, member_id)
        .await
        .map_err(db_error)?;

    let Some(row) = row else {
        return Ok(None);
    };

    Ok(onboarding_from_row(&row))
}

/// The mapping from a stored onboarding row, validating each slug against the
/// contract picklists.
fn onboarding_from_row(row: &OnboardingRow) -> Option<Onboarding> {
    let persona = match row.persona.as_str() {
        "owner" => OnboardingPersona::Owner,
        "staff" => OnboardingPersona::Staff,
        "exploring" => OnboardingPersona::Exploring,
        "partner" => OnboardingPersona::Partner,
        _ => return None,
    };

    let segment = row.segment.as_deref().and_then(|raw| match raw {
        "restaurant" => Some(OnboardingSegment::Restaurant),
        "snack" => Some(OnboardingSegment::Snack),
        "market" => Some(OnboardingSegment::Market),
        "sweets" => Some(OnboardingSegment::Sweets),
        "other" => Some(OnboardingSegment::Other),
        _ => None,
    });

    let referral = row.referral.as_deref().and_then(|raw| match raw {
        "referral" => Some(OnboardingReferral::Referral),
        "instagram" => Some(OnboardingReferral::Instagram),
        "google" => Some(OnboardingReferral::Google),
        "other" => Some(OnboardingReferral::Other),
        _ => None,
    });

    Some(Onboarding {
        persona,
        segment,
        referral,
    })
}
