//! Commerce-wide member and capability helpers, ported from
//! `packages/api-commerce/src/domains/commerce/support.ts`.
//!
//! The tenant arrives as `x-menuza-tenant-id`, written server-side by the web
//! proxy; the caller is a **store member**, resolved from the commerce session
//! cookie (`menuza_commerce_sid`) and their `TenantMembership` row. A session
//! without a membership gets `NOT_FOUND`, so the endpoint never leaks whether a
//! store exists.
//!
//! Capabilities come from the code-level map (`can`), never from the stored role
//! string: `orders:refund` and `wallet:adjust` are what actually gate the money,
//! and a role the map does not know lands on the least-privileged one.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use persistence::commerce::member::{membership_role, session_find, session_touch};
use persistence::tenant::TenantId;
use serde_json::json;
use sqlx::PgPool;

use contract::{ApiErrorBody, ErrorCode};
use domain::session::{SESSION_IDLE_SECONDS, SESSION_TOUCH_SECONDS, hash_session_token};

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

/// The authenticated member acting on the resolved tenant store.
pub struct StoreMember {
    pub member_id: String,
    pub role: TenantRole,
}

/// A contract error as an axum response.
#[derive(Debug)]
pub struct ApiError(pub ErrorCode);

impl ApiError {
    /// The session is missing, revoked, expired or not a commerce session.
    pub fn unauthorized() -> Self {
        Self(ErrorCode::Unauthorized)
    }

    /// The caller has no membership on the resolved tenant.
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

/// Resolves the commerce session and the member's role on `tenant`.
///
/// The session is looked up by the digest of the raw cookie value, then judged
/// the way the TS does: revoked, past its absolute expiry, or idle past 24
/// hours is rejected. The idle window slides forward, but a write happens only
/// when the stored `lastUsedAt` is at least 300 seconds old.
pub async fn require_member(
    pool: &PgPool,
    tenant: &TenantId,
    raw_cookie: &str,
) -> Result<StoreMember, ApiError> {
    if raw_cookie.is_empty() {
        return Err(ApiError::unauthorized());
    }

    let digest = hash_session_token(raw_cookie);
    let session = session_find(pool, &digest)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?
        .ok_or_else(ApiError::unauthorized)?;

    if session.namespace != "commerce" {
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
        session_touch(pool, &digest, now)
            .await
            .map_err(|_| ApiError(ErrorCode::Internal))?;
    }

    let stored_role = membership_role(pool, tenant, &session.member_id)
        .await
        .map_err(|_| ApiError(ErrorCode::Internal))?
        .ok_or_else(ApiError::not_found)?;

    Ok(StoreMember {
        member_id: session.member_id,
        role: TenantRole::parse(&stored_role).unwrap_or(TenantRole::Staff),
    })
}

/// Caps the caller at what its role grants.
pub fn require_capability(member: &StoreMember, capability: &str) -> Result<(), ApiError> {
    if can(member.role, capability) {
        return Ok(());
    }

    Err(ApiError::forbidden())
}

#[cfg(test)]
mod tests {
    use contract::ErrorCode;

    use super::{TENANT_CAPABILITIES, TenantRole, can, db_error};

    #[test]
    fn a_storage_failure_is_internal_not_missing() {
        assert_eq!(db_error(sqlx::Error::PoolClosed).0, ErrorCode::Internal);
    }

    #[test]
    fn grants_match_the_ts_matrix() {
        assert!(
            TENANT_CAPABILITIES
                .iter()
                .all(|cap| can(TenantRole::Owner, cap))
        );
        assert!(
            TENANT_CAPABILITIES
                .iter()
                .all(|cap| can(TenantRole::Admin, cap) == (*cap != "team:write"))
        );
        assert_eq!(
            TENANT_CAPABILITIES
                .iter()
                .filter(|cap| can(TenantRole::Staff, cap))
                .copied()
                .collect::<Vec<_>>(),
            vec![
                "dashboard:read",
                "orders:read",
                "orders:write",
                "payments:read"
            ]
        );
        assert!(!can(TenantRole::Staff, "orders:refund"));
        assert!(!can(TenantRole::Admin, "unknown:capability"));
    }

    #[test]
    fn roles_round_trip_and_unknown_parses_to_none() {
        for (raw, role) in [
            ("owner", TenantRole::Owner),
            ("admin", TenantRole::Admin),
            ("staff", TenantRole::Staff),
        ] {
            assert_eq!(TenantRole::parse(raw), Some(role));
        }

        assert_eq!(TenantRole::parse("manager"), None);
    }
}
