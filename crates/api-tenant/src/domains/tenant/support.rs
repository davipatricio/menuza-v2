//! Tenant-wide member and capability helpers, ported from
//! `packages/api-tenant/src/domains/tenant/subdomains/panel/support.ts`.
//!
//! The tenant dashboard session cookie (`menuza_tenant_sid`) is validated
//! first; the store is named by `storeSlug` and bound to the session with a
//! `TenantMembership` row. A slug that names no tenant and a member that has no
//! membership both answer `NOT_FOUND`, so neither leaks whether a store exists.
//!
//! Capabilities come from the code-level map (`can`), never from the stored role
//! string: a role the map does not know lands on the least-privileged one.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use contract::{ApiErrorBody, ErrorCode};
use domain::session::{SESSION_IDLE_SECONDS, SESSION_TOUCH_SECONDS, hash_session_token};
use menuza_http::TenantScope;
use persistence::tenant::TenantId;
use persistence::tenant::membership::{membership_role, tenant_by_slug};
use persistence::tenant::session::{session_find, session_touch};
use serde_json::json;
use sqlx::PgPool;

/// The session namespace the tenant dashboard cookie belongs to.
const TENANT_NAMESPACE: &str = "tenant";

/// Every capability a store dashboard gates today, verbatim from
/// `TENANT_CAPABILITIES` in `apps/orpc-server/src/auth/types.ts`.
pub const TENANT_CAPABILITIES: [&str; 11] = [
    "dashboard:read",
    "orders:read",
    "orders:write",
    "orders:refund",
    "wallet:adjust",
    "team:read",
    "team:write",
    "seo:write",
    "catalog:write",
    "payments:read",
    "payments:write",
];

/// A `TenantMembership.role` narrowed to the closed set.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TenantRole {
    Owner,
    Admin,
    Staff,
}

impl TenantRole {
    /// Parses a stored role string; an unknown one is `None`, so the caller
    /// can apply the least-privileged fallback.
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "owner" => Some(Self::Owner),
            "admin" => Some(Self::Admin),
            "staff" => Some(Self::Staff),
            _ => None,
        }
    }
}

/// Single source of truth for grants, mirroring `ROLE_CAPABILITIES` in the TS:
/// owner holds every capability, admin every one but `team:write`, staff the
/// four store-facing reads and writes.
pub fn can(role: TenantRole, capability: &str) -> bool {
    match role {
        TenantRole::Owner => TENANT_CAPABILITIES.contains(&capability),
        TenantRole::Admin => {
            capability != "team:write" && TENANT_CAPABILITIES.contains(&capability)
        }
        TenantRole::Staff => matches!(
            capability,
            "dashboard:read" | "orders:read" | "orders:write" | "payments:read"
        ),
    }
}

/// The authenticated member behind the tenant session cookie.
///
/// `role` is the least-privileged [`TenantRole::Staff`] until
/// [`panel_tenant`] binds the store's membership; a handler that never calls
/// it can only be denied, never over-granted.
pub struct StoreMember {
    pub member_id: String,
    /// The session row id (the token digest), never the raw token.
    pub session_id: String,
    pub role: TenantRole,
}

/// A contract error as an axum response.
#[derive(Debug)]
pub struct ApiError(pub ErrorCode);

impl ApiError {
    /// The session is missing, revoked, expired or not a tenant session.
    pub fn unauthorized() -> Self {
        Self(ErrorCode::Unauthorized)
    }

    /// The store slug names no tenant, or the member has no membership on it.
    pub fn not_found() -> Self {
        Self(ErrorCode::NotFound)
    }

    /// The member's role does not hold the capability.
    pub fn forbidden() -> Self {
        Self(ErrorCode::Forbidden)
    }
}

/// A failed read is `INTERNAL`, never a missing row: a broken database must not
/// read as a 404.
pub fn db_error(_: sqlx::Error) -> ApiError {
    ApiError(ErrorCode::Internal)
}

impl IntoResponse for ApiError {
    /// The contract envelope: `status()` from the code, its catalog message,
    /// and the wire string echoed in `data`.
    fn into_response(self) -> Response {
        let wire = serde_json::to_value(self.0).unwrap_or_default();
        let status =
            StatusCode::from_u16(self.0.status()).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

        (
            status,
            Json(ApiErrorBody::with_data(self.0, json!({ "code": wire }))),
        )
            .into_response()
    }
}

/// Resolves the tenant session cookie to the member that holds it.
///
/// The session is looked up by the digest of the raw cookie value, then judged
/// the way the TS does: revoked, past its absolute expiry, or idle past 24
/// hours is rejected. The idle window slides forward, but a write happens only
/// when the stored `lastUsedAt` is at least 300 seconds old.
pub async fn require_member(pool: &PgPool, raw_token: &str) -> Result<StoreMember, ApiError> {
    if raw_token.is_empty() {
        return Err(ApiError::unauthorized());
    }

    let digest = hash_session_token(raw_token);
    let session = session_find(pool, &digest)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::unauthorized)?;

    if session.namespace != TENANT_NAMESPACE {
        return Err(ApiError::unauthorized());
    }

    let now = chrono::Utc::now().naive_utc();

    if session.revoked_at.is_some()
        || session.expires_at <= now
        || session.last_used_at <= now - chrono::Duration::seconds(SESSION_IDLE_SECONDS)
    {
        return Err(ApiError::unauthorized());
    }

    if session.last_used_at <= now - chrono::Duration::seconds(SESSION_TOUCH_SECONDS) {
        session_touch(pool, &digest, now).await.map_err(db_error)?;
    }

    Ok(StoreMember {
        member_id: session.member_id,
        session_id: session.id,
        role: TenantRole::Staff,
    })
}

/// Resolves `storeSlug` to the tenant the member may act on, and binds the
/// membership's role onto `member`.
///
/// A slug that names no tenant and a member without a membership answer the
/// same `NOT_FOUND`; the caller cannot tell the two apart.
pub async fn panel_tenant(
    pool: &PgPool,
    member: &mut StoreMember,
    store_slug: &str,
) -> Result<TenantId, ApiError> {
    let tenant = tenant_by_slug(pool, store_slug)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    let stored_role = membership_role(pool, &tenant, &member.member_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    member.role = TenantRole::parse(&stored_role).unwrap_or(TenantRole::Staff);

    Ok(tenant)
}

/// Caps the caller at what its role grants.
pub fn require_capability(member: &StoreMember, capability: &str) -> Result<(), ApiError> {
    if can(member.role, capability) {
        return Ok(());
    }

    Err(ApiError::forbidden())
}

/// The tenant an internal, trusted-hop request resolved, or
/// `TENANT_NOT_RESOLVED` when it carried none.
pub fn tenant_of(scope: &TenantScope) -> Result<TenantId, ApiError> {
    let raw = scope
        .tenant_id()
        .ok_or(ApiError(ErrorCode::TenantNotResolved))?;

    TenantId::parse(raw).map_err(|_| ApiError(ErrorCode::TenantNotResolved))
}
