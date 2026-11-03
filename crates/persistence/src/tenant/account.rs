//! account subdomain queries, ported from the Bun account support.
//!
//! `Session`, `Member` and the MCP grant tables are not tenant-scoped models:
//! every statement is keyed by the member id, and a revocation is an
//! `"revokedAt"` write rather than a deleted row. The affected-row count is what
//! the API returns, so an already-revoked row counts as zero.

use chrono::NaiveDateTime;
use sqlx::PgPool;

/// One `Session` row as the account page reads it.
pub struct SessionListRow {
    pub id: String,
    pub created_at: NaiveDateTime,
    pub last_used_at: NaiveDateTime,
    pub expires_at: NaiveDateTime,
    pub revoked_at: Option<NaiveDateTime>,
}

/// Every session of a member in one namespace. Revocation and idle rules are
/// judged by the caller, matching the TS list.
pub async fn sessions_by_member(
    pool: &PgPool,
    member_id: &str,
    namespace: &str,
) -> Result<Vec<SessionListRow>, sqlx::Error> {
    type Row = (
        String,
        NaiveDateTime,
        NaiveDateTime,
        NaiveDateTime,
        Option<NaiveDateTime>,
    );

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT id, "createdAt", "lastUsedAt", "expiresAt", "revokedAt"
           FROM "Session"
           WHERE "memberId" = $1 AND namespace = $2"#,
    )
    .bind(member_id)
    .bind(namespace)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, created_at, last_used_at, expires_at, revoked_at)| SessionListRow {
                id,
                created_at,
                last_used_at,
                expires_at,
                revoked_at,
            },
        )
        .collect())
}

/// Revokes one digest of a member and returns how many live rows changed.
///
/// The `"memberId"` filter is what keeps this from being "revoke any session by
/// id": another member's digest is simply not in the filtered set.
pub async fn session_revoke_by_member(
    pool: &PgPool,
    member_id: &str,
    digest: &str,
    now: NaiveDateTime,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"UPDATE "Session" SET "revokedAt" = $3
           WHERE "memberId" = $1 AND id = $2 AND "revokedAt" IS NULL"#,
    )
    .bind(member_id)
    .bind(digest)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// Revokes every live session of a member except the caller's digest.
pub async fn sessions_revoke_all_except(
    pool: &PgPool,
    member_id: &str,
    keep_digest: &str,
    now: NaiveDateTime,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"UPDATE "Session" SET "revokedAt" = $3
           WHERE "memberId" = $1 AND id <> $2 AND "revokedAt" IS NULL"#,
    )
    .bind(member_id)
    .bind(keep_digest)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// Stores a new password hash and refreshes `updatedAt`.
pub async fn member_update_password(
    pool: &PgPool,
    member_id: &str,
    password_hash: &str,
    now: NaiveDateTime,
) -> Result<u64, sqlx::Error> {
    let result =
        sqlx::query(r#"UPDATE "Member" SET "passwordHash" = $2, "updatedAt" = $3 WHERE id = $1"#)
            .bind(member_id)
            .bind(password_hash)
            .bind(now)
            .execute(pool)
            .await?;

    Ok(result.rows_affected())
}

/// Revokes every live MCP grant of a member and the OAuth tokens behind them.
///
/// A connected MCP client holds a bearer token that is not a `Session` row, so
/// the session revocation above does not reach it. Both tables are written in
/// one transaction: revoking only the handle would leave a live token.
pub async fn mcp_sessions_revoke_member(
    pool: &PgPool,
    member_id: &str,
    now: NaiveDateTime,
) -> Result<u64, sqlx::Error> {
    let token_ids: Vec<String> = sqlx::query_as::<_, (String,)>(
        r#"SELECT "oauthTokenId" FROM "McpSession"
           WHERE "memberId" = $1 AND "revokedAt" IS NULL"#,
    )
    .bind(member_id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|(id,)| id)
    .collect();

    if token_ids.is_empty() {
        return Ok(0);
    }

    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"UPDATE "McpSession" SET "revokedAt" = $2
           WHERE "memberId" = $1 AND "revokedAt" IS NULL"#,
    )
    .bind(member_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"UPDATE "OAuthToken" SET "revokedAt" = $1
           WHERE id = ANY($2) AND "revokedAt" IS NULL"#,
    )
    .bind(now)
    .bind(&token_ids)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(token_ids.len() as u64)
}
