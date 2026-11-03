//! Commerce session and membership queries, ported from
//! `apps/orpc-server/src/auth/session.ts`.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use crate::tenant::TenantId;

/// A `Session` row as stored. The id is the sha256 of the presented token.
pub struct SessionRow {
    pub id: String,
    pub member_id: String,
    pub namespace: String,
    pub expires_at: NaiveDateTime,
    pub last_used_at: NaiveDateTime,
    pub revoked_at: Option<NaiveDateTime>,
}

/// Looks a session up by token digest.
///
/// `Session` carries no `"tenantId"`, so there is nothing to scope here: the
/// digest is the whole key, and the caller judges revocation and expiry.
pub async fn session_find(pool: &PgPool, digest: &str) -> Result<Option<SessionRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        NaiveDateTime,
        NaiveDateTime,
        Option<NaiveDateTime>,
    );

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, "memberId", namespace, "expiresAt", "lastUsedAt", "revokedAt"
           FROM "Session"
           WHERE id = $1"#,
    )
    .bind(digest)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(id, member_id, namespace, expires_at, last_used_at, revoked_at)| SessionRow {
            id,
            member_id,
            namespace,
            expires_at,
            last_used_at,
            revoked_at,
        },
    ))
}

/// Slides a session's idle window forward.
///
/// Same statement as the TS: `Session` has no tenant column, so the digest is
/// the only key.
pub async fn session_touch(
    pool: &PgPool,
    digest: &str,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "Session" SET "lastUsedAt" = $2 WHERE id = $1"#)
        .bind(digest)
        .bind(now)
        .execute(pool)
        .await?;

    Ok(())
}

/// The stored role string for one member of one tenant, if the membership
/// exists.
pub async fn membership_role(
    pool: &PgPool,
    tenant: &TenantId,
    member_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_as::<_, (String,)>(
        r#"SELECT role FROM "TenantMembership" WHERE "tenantId" = $1 AND "memberId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(member_id)
    .fetch_optional(pool)
    .await
    .map(|row| row.map(|(role,)| role))
}
