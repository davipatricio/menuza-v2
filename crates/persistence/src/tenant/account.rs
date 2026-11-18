//! account subdomain queries, ported from the Bun account support.
//!
//! `Session`, `Member` and the MCP grant tables are not tenant-scoped models:
//! every statement is keyed by the member id, and a revocation is an
//! `"revokedAt"` write rather than a deleted row. The affected-row count is what
//! the API returns, so an already-revoked row counts as zero.

use chrono::NaiveDateTime;
use sqlx::PgPool;

/// What one account deletion changed.
pub struct DeletedAccount {
    pub stores_archived: u64,
    pub memberships_removed: u64,
}

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

/// Deletes a member and archives the stores left without an owner.
///
/// One transaction, because a half-deleted account is worse than none: the
/// membership rows, the bearer tokens and the member row all move together.
///
/// `McpSession`, `OAuthToken` and `OAuthAuthCode` carry `"memberId"` with no
/// foreign key, so a cascade will not reach them — a deleted member would leave
/// live MCP bearer tokens behind. They are deleted here, not merely revoked:
/// there is no member left to own them.
///
/// A store the member was the last `owner` of is archived, never deleted. Its
/// `Order` rows are the buyers' receipts and the store's history, so the tenant
/// outlives the account and its slug stays taken: a new store can never inherit
/// the old store's order URLs.
pub async fn account_delete(
    pool: &PgPool,
    member_id: &str,
    now: NaiveDateTime,
) -> Result<DeletedAccount, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let archived = sqlx::query(
        r#"UPDATE "Tenant" t SET "archivedAt" = $2
           FROM "TenantMembership" m
           WHERE m."tenantId" = t.id
             AND m."memberId" = $1
             AND m.role = 'owner'
             AND t."archivedAt" IS NULL
             AND NOT EXISTS (
                 SELECT 1 FROM "TenantMembership" o
                 WHERE o."tenantId" = m."tenantId"
                   AND o.role = 'owner'
                   AND o."memberId" <> $1
             )"#,
    )
    .bind(member_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(r#"DELETE FROM "MemberOnboarding" WHERE "memberId" = $1"#)
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(r#"DELETE FROM "OAuthAuthCode" WHERE "memberId" = $1"#)
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(r#"DELETE FROM "OAuthToken" WHERE "memberId" = $1"#)
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(r#"DELETE FROM "McpSession" WHERE "memberId" = $1"#)
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

    let memberships = sqlx::query(r#"DELETE FROM "TenantMembership" WHERE "memberId" = $1"#)
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(r#"DELETE FROM "Member" WHERE id = $1"#)
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(DeletedAccount {
        stores_archived: archived.rows_affected(),
        memberships_removed: memberships.rows_affected(),
    })
}

/// Revokes every connected MCP grant and OAuth bearer/authorization code of a
/// member in one transaction.
///
/// A connected MCP client holds a bearer token that is not a `Session` row, and
/// a newly minted `OAuthToken` may not have opened a `McpSession` yet; revoking
/// `OAuthToken` directly by `"memberId"` closes both, and deleting unredeemed
/// `OAuthAuthCode` rows stops an in-flight code from being exchanged after a
/// password change.
pub async fn mcp_sessions_revoke_member(
    pool: &PgPool,
    member_id: &str,
    now: NaiveDateTime,
) -> Result<u64, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let sessions = sqlx::query(
        r#"UPDATE "McpSession" SET "revokedAt" = $2
           WHERE "memberId" = $1 AND "revokedAt" IS NULL"#,
    )
    .bind(member_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    let tokens = sqlx::query(
        r#"UPDATE "OAuthToken" SET "revokedAt" = $2
           WHERE "memberId" = $1 AND "revokedAt" IS NULL"#,
    )
    .bind(member_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(r#"DELETE FROM "OAuthAuthCode" WHERE "memberId" = $1"#)
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(sessions.rows_affected().max(tokens.rows_affected()))
}

#[cfg(test)]
mod tests {
    use super::*;

    // The checks below run against `DATABASE_URL` and skip when it is unset, so
    // the crate's default `cargo test` still needs no infrastructure.

    /// Runs one check on a current-thread runtime with the pool it opened.
    fn with_database<F, Fut>(check: F)
    where
        F: FnOnce(PgPool) -> Fut,
        Fut: std::future::Future<Output = ()>,
    {
        let Ok(url) = std::env::var("DATABASE_URL") else {
            return;
        };

        sqlx::test_block_on(async move {
            let pool = PgPool::connect(&url)
                .await
                .expect("the test database connects");

            check(pool).await;
        });
    }

    fn now() -> NaiveDateTime {
        chrono::Utc::now().naive_utc()
    }

    /// A throwaway member; the id is unique so a repeat run never collides.
    async fn new_member(pool: &PgPool, email: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            r#"INSERT INTO "Member" (id, email, name, kind, "createdAt", "updatedAt")
               VALUES ($1, $2, 'Probe', 'human', now(), now())"#,
        )
        .bind(&id)
        .bind(email)
        .execute(pool)
        .await
        .expect("insert member");

        id
    }

    /// A throwaway tenant owned by `member_id`, with one domain and one order,
    /// so the archive is proven against the rows that must survive it.
    async fn new_store(pool: &PgPool, member_id: &str, slug: &str) -> String {
        let id = uuid::Uuid::new_v4().to_string();

        sqlx::query(
            r#"INSERT INTO "Tenant" (id, slug, "displayName", "createdAt", "updatedAt")
               VALUES ($1, $2, $2, now(), now())"#,
        )
        .bind(&id)
        .bind(slug)
        .execute(pool)
        .await
        .expect("insert tenant");

        sqlx::query(
            r#"INSERT INTO "TenantMembership" (id, "memberId", "tenantId", role, "createdAt")
               VALUES ($1, $2, $3, 'owner', now())"#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(member_id)
        .bind(&id)
        .execute(pool)
        .await
        .expect("insert membership");

        id
    }

    async fn drop_store(pool: &PgPool, tenant_id: &str) {
        sqlx::query(r#"DELETE FROM "Tenant" WHERE id = $1"#)
            .bind(tenant_id)
            .execute(pool)
            .await
            .expect("delete tenant");
    }

    async fn drop_member(pool: &PgPool, member_id: &str) {
        sqlx::query(r#"DELETE FROM "Member" WHERE id = $1"#)
            .bind(member_id)
            .execute(pool)
            .await
            .expect("delete member");
    }

    /// The last owner's store survives as an archive, and the member is gone.
    #[test]
    fn the_last_owner_archives_the_store_instead_of_deleting_it() {
        with_database(|pool| async move {
            let email = format!("archive-{}@example.com", uuid::Uuid::new_v4());
            let member = new_member(&pool, &email).await;
            let tenant = new_store(&pool, &member, &uuid::Uuid::new_v4().to_string()).await;

            let deleted = account_delete(&pool, &member, now())
                .await
                .expect("delete the account");

            assert_eq!(deleted.stores_archived, 1);
            assert_eq!(deleted.memberships_removed, 1);

            let archived: Option<NaiveDateTime> =
                sqlx::query_scalar(r#"SELECT "archivedAt" FROM "Tenant" WHERE id = $1"#)
                    .bind(&tenant)
                    .fetch_one(&pool)
                    .await
                    .expect("the tenant row survives");

            assert!(
                archived.is_some(),
                "the store must be archived, not dropped"
            );

            let members: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "Member" WHERE id = $1"#)
                .bind(&member)
                .fetch_one(&pool)
                .await
                .expect("count members");

            assert_eq!(members, 0, "the member row is deleted");

            drop_store(&pool, &tenant).await;
        });
    }

    /// A store with another owner keeps selling: only the caller leaves.
    #[test]
    fn a_store_with_another_owner_is_not_archived() {
        with_database(|pool| async move {
            let leaver =
                new_member(&pool, &format!("a-{}@example.com", uuid::Uuid::new_v4())).await;
            let other = new_member(&pool, &format!("b-{}@example.com", uuid::Uuid::new_v4())).await;
            let tenant = new_store(&pool, &leaver, &uuid::Uuid::new_v4().to_string()).await;

            sqlx::query(
                r#"INSERT INTO "TenantMembership" (id, "memberId", "tenantId", role, "createdAt")
                   VALUES ($1, $2, $3, 'owner', now())"#,
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&other)
            .bind(&tenant)
            .execute(&pool)
            .await
            .expect("insert the second owner");

            let deleted = account_delete(&pool, &leaver, now())
                .await
                .expect("delete the account");

            assert_eq!(deleted.stores_archived, 0);

            let archived: Option<NaiveDateTime> =
                sqlx::query_scalar(r#"SELECT "archivedAt" FROM "Tenant" WHERE id = $1"#)
                    .bind(&tenant)
                    .fetch_one(&pool)
                    .await
                    .expect("the tenant row survives");

            assert!(archived.is_none(), "another owner keeps the store live");

            drop_store(&pool, &tenant).await;
            drop_member(&pool, &other).await;
        });
    }

    /// A member's bearer tokens carry no foreign key, so deleting the member
    /// must delete them explicitly — a revoked grant is not good enough when the
    /// owner no longer exists.
    #[test]
    fn the_members_bearer_tokens_are_deleted_with_the_account() {
        with_database(|pool| async move {
            let member =
                new_member(&pool, &format!("mcp-{}@example.com", uuid::Uuid::new_v4())).await;
            let client_id = format!("probe-{}", uuid::Uuid::new_v4());

            sqlx::query(
                r#"INSERT INTO "OAuthClient" ("clientId", id, name, "isPublic", "redirectUris", "createdAt")
                   VALUES ($1, $1, 'Probe client', true, ARRAY[]::text[], now())"#,
            )
            .bind(&client_id)
            .execute(&pool)
            .await
            .expect("insert the oauth client");

            sqlx::query(
                r#"INSERT INTO "OAuthToken"
                       (id, "memberId", "clientId", "accessTokenHash", scopes, "tenantIds",
                        "expiresAt", "createdAt")
                   VALUES ($1, $2, $3, $1, ARRAY['mcp'], ARRAY[]::text[],
                           now() + interval '1 hour', now())"#,
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&member)
            .bind(&client_id)
            .execute(&pool)
            .await
            .expect("insert a token");

            account_delete(&pool, &member, now())
                .await
                .expect("delete the account");

            let tokens: i64 =
                sqlx::query_scalar(r#"SELECT count(*) FROM "OAuthToken" WHERE "memberId" = $1"#)
                    .bind(&member)
                    .fetch_one(&pool)
                    .await
                    .expect("count tokens");

            assert_eq!(tokens, 0, "a deleted member leaves no live token");

            sqlx::query(r#"DELETE FROM "OAuthClient" WHERE "clientId" = $1"#)
                .bind(&client_id)
                .execute(&pool)
                .await
                .expect("delete the oauth client");
        });
    }
}
