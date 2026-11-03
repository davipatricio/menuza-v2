//! MCP queries, ported from `apps/tenant/src/mcp/server.ts`.
//!
//! The endpoint authenticates with a bearer token, not the dashboard cookie, so
//! it reads the OAuth tables directly: `OAuthToken` for the grant,
//! `TenantMembership` joined to `Tenant` for the stores it covers, and
//! `StoreIntegration` for the per-store switch that publishes the tools.
//! `McpSession` is the row the dashboard lists and revokes, keyed by the token
//! digest rather than by request. The unique index is on `tokenDigest` alone,
//! so one token is one row and every granted store sees it rather than
//! inventing a row each.
//!
//! A token spans the stores it was granted, so these are member-level
//! statements like the session ones, not `Scope` statements. The two that carry
//! a tenant bind it explicitly.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use crate::tenant::TenantId;

/// The `integrationId` the dashboard MCP surface belongs to.
pub const MCP_DASHBOARD: &str = "mcp-dashboard";

/// A live access token, narrowed to what the grant needs.
///
/// The digest is the lookup key; the raw secret is never stored, so this row
/// cannot reproduce it.
pub struct OAuthTokenRow {
    pub id: String,
    pub member_id: String,
    pub tenant_ids: Vec<String>,
    pub expires_at: NaiveDateTime,
    pub revoked_at: Option<NaiveDateTime>,
}

/// One store a token's grant covers, with the member's role on it.
pub struct GrantMembership {
    pub tenant_id: String,
    pub slug: String,
    pub role: String,
}

/// One MCP client session to insert; the token digest is its identity.
pub struct NewMcpSession<'a> {
    pub tenant_id: &'a TenantId,
    pub member_id: &'a str,
    pub label: &'a str,
    pub client_name: &'a str,
    pub oauth_token_id: &'a str,
    pub token_digest: &'a str,
    pub last_used_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
}

/// The token behind a digest, or `None` when it was never minted or already
/// revoked.
///
/// Expiry is judged by the caller: this returns the row and lets the gate apply
/// the same rules it applies to every other credential.
pub async fn oauth_token_find(
    pool: &PgPool,
    access_token_hash: &str,
) -> Result<Option<OAuthTokenRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        Vec<String>,
        NaiveDateTime,
        Option<NaiveDateTime>,
    );

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, "memberId" AS member_id, "tenantIds" AS tenant_ids,
                  "expiresAt" AS expires_at, "revokedAt" AS revoked_at
             FROM "OAuthToken"
            WHERE "accessTokenHash" = $1"#,
    )
    .bind(access_token_hash)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(id, member_id, tenant_ids, expires_at, revoked_at)| OAuthTokenRow {
            id,
            member_id,
            tenant_ids,
            expires_at,
            revoked_at,
        },
    ))
}

/// The memberships a grant covers: the member's own rows, intersected with the
/// stores the token was granted.
///
/// A token always carries its `tenantIds` array, so an empty one covers nothing
/// — that is a token granted no store, not a token granted every store.
pub async fn grant_memberships(
    pool: &PgPool,
    member_id: &str,
    tenant_ids: &[String],
) -> Result<Vec<GrantMembership>, sqlx::Error> {
    type Row = (String, String, String);

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT m."tenantId", t.slug, m.role
             FROM "TenantMembership" m
             JOIN "Tenant" t ON t.id = m."tenantId"
            WHERE m."memberId" = $1
              AND m."tenantId" = ANY($2)
            ORDER BY m."createdAt", m.id"#,
    )
    .bind(member_id)
    .bind(tenant_ids)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(tenant_id, slug, role)| GrantMembership {
            tenant_id,
            slug,
            role,
        })
        .collect())
}

/// Whether this store switched the dashboard MCP integration on.
///
/// The switch is the publish control: a token proves who the member is, the
/// switch proves the store agreed to serve tools. A store with no row never
/// enabled it.
pub async fn mcp_integration_enabled(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<bool, sqlx::Error> {
    let status = sqlx::query_scalar::<_, String>(
        r#"SELECT status
             FROM "StoreIntegration"
            WHERE "tenantId" = $1 AND "integrationId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(MCP_DASHBOARD)
    .fetch_optional(pool)
    .await?;

    Ok(status.as_deref() == Some("enabled"))
}

/// Slides `lastUsedAt` for the session this token already has. `false` when no
/// row exists yet.
///
/// The update matches the digest alone on purpose: `McpSession_tokenDigest_key`
/// makes one token one row, and a store filter here would mint a second row the
/// unique index refuses. The row is what the dashboard revokes from any of the
/// grant's stores, and it was created with the tenant the token first reached.
pub async fn mcp_session_touch(
    pool: &PgPool,
    token_digest: &str,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let updated =
        sqlx::query(r#"UPDATE "McpSession" SET "lastUsedAt" = $2 WHERE "tokenDigest" = $1"#)
            .bind(token_digest)
            .bind(now)
            .execute(pool)
            .await?;

    Ok(updated.rows_affected() > 0)
}

/// Records the first use of a token on a store.
///
/// `ON CONFLICT DO NOTHING` covers the race: two first requests on the same
/// token both miss the touch, and the loser used to answer `500` on the unique
/// digest. The winner's row is the one the dashboard lists.
pub async fn mcp_session_create(
    pool: &PgPool,
    session: &NewMcpSession<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "McpSession"
               (id, "tenantId", "memberId", "integrationId", label, "clientName",
                "oauthTokenId", "tokenDigest", "lastUsedAt", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT ("tokenDigest") DO NOTHING"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(session.tenant_id.as_str())
    .bind(session.member_id)
    .bind(MCP_DASHBOARD)
    .bind(session.label)
    .bind(session.client_name)
    .bind(session.oauth_token_id)
    .bind(session.token_digest)
    .bind(session.last_used_at)
    .bind(session.created_at)
    .execute(pool)
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tenant::panel::integrations::{
        mcp_session_find, mcp_session_list, mcp_session_revoke,
    };

    // The checks below run against `DATABASE_URL` and skip when it is unset, so
    // the crate's default `cargo test` still needs no infrastructure.

    /// Runs one check on a current-thread runtime with the pool it opened.
    ///
    /// `sqlx` exports the block-on its own test macro uses, so no extra
    /// dependency is needed. The pool and its statements share one runtime on
    /// purpose: a pool outlives the runtime that built it, and its connections
    /// come back closed.
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

    /// Two granted stores plus one outside the grant, one member, one client and
    /// the token that covers the first two.
    struct Fixtures {
        first: TenantId,
        second: TenantId,
        outside: TenantId,
        member_id: String,
        client_id: String,
        token_id: String,
    }

    async fn new_tenant(pool: &PgPool, label: &str) -> TenantId {
        let id = format!("t-{}", uuid::Uuid::new_v4());

        sqlx::query(
            r#"INSERT INTO "Tenant" (id, slug, "displayName", "updatedAt")
               VALUES ($1, $1, $2, now())"#,
        )
        .bind(&id)
        .bind(label)
        .execute(pool)
        .await
        .expect("insert tenant");

        TenantId::parse(&id).expect("the id is not empty")
    }

    async fn fixtures(pool: &PgPool) -> Fixtures {
        let first = new_tenant(pool, "first").await;
        let second = new_tenant(pool, "second").await;
        let outside = new_tenant(pool, "outside").await;
        let member_id = format!("m-{}", uuid::Uuid::new_v4());
        let client_id = format!("c-{}", uuid::Uuid::new_v4());
        let token_id = format!("o-{}", uuid::Uuid::new_v4());

        sqlx::query(
            r#"INSERT INTO "Member" (id, email, "updatedAt")
               VALUES ($1, $2, now())"#,
        )
        .bind(&member_id)
        .bind(format!("{member_id}@example.test"))
        .execute(pool)
        .await
        .expect("insert member");

        sqlx::query(
            r#"INSERT INTO "OAuthClient" ("clientId", id, name, "redirectUris")
               VALUES ($1, $1, 'test', '{}')"#,
        )
        .bind(&client_id)
        .execute(pool)
        .await
        .expect("insert client");

        sqlx::query(
            r#"INSERT INTO "OAuthToken"
                   ("accessTokenHash", "clientId", "expiresAt", id, "memberId",
                    scopes, "tenantIds")
               VALUES ($1, $2, now() + interval '1 hour', $3, $4, '{}', $5)"#,
        )
        .bind(&token_id)
        .bind(&client_id)
        .bind(&token_id)
        .bind(&member_id)
        .bind(vec![first.as_str().to_owned(), second.as_str().to_owned()])
        .execute(pool)
        .await
        .expect("insert token");

        Fixtures {
            first,
            second,
            outside,
            member_id,
            client_id,
            token_id,
        }
    }

    async fn cleanup(pool: &PgPool, fixtures: &Fixtures) {
        for statement in [
            r#"DELETE FROM "McpSession" WHERE "oauthTokenId" = $1"#,
            r#"DELETE FROM "OAuthToken" WHERE id = $1"#,
        ] {
            sqlx::query(statement)
                .bind(&fixtures.token_id)
                .execute(pool)
                .await
                .expect("delete the token rows");
        }

        sqlx::query(r#"DELETE FROM "OAuthClient" WHERE id = $1"#)
            .bind(&fixtures.client_id)
            .execute(pool)
            .await
            .expect("delete the client");

        sqlx::query(r#"DELETE FROM "Member" WHERE id = $1"#)
            .bind(&fixtures.member_id)
            .execute(pool)
            .await
            .expect("delete the member");

        for tenant in [&fixtures.first, &fixtures.second, &fixtures.outside] {
            sqlx::query(r#"DELETE FROM "Tenant" WHERE id = $1"#)
                .bind(tenant.as_str())
                .execute(pool)
                .await
                .expect("delete the tenant");
        }
    }

    #[test]
    fn a_racing_first_request_cannot_collide_on_the_digest() {
        with_database(|pool| async move {
            let fixtures = fixtures(&pool).await;
            let at = now();
            let digest = format!("d-{}", uuid::Uuid::new_v4());

            let session = NewMcpSession {
                tenant_id: &fixtures.first,
                member_id: &fixtures.member_id,
                label: "claude — 2026-11-03",
                client_name: "claude",
                oauth_token_id: &fixtures.token_id,
                token_digest: &digest,
                last_used_at: at,
                created_at: at,
            };

            mcp_session_create(&pool, &session)
                .await
                .expect("the first request records the row");
            mcp_session_create(&pool, &session)
                .await
                .expect("the loser of the race is a no-op, never a unique violation");

            let rows = sqlx::query_scalar::<_, i64>(
                r#"SELECT count(*)::bigint FROM "McpSession" WHERE "tokenDigest" = $1"#,
            )
            .bind(&digest)
            .fetch_one(&pool)
            .await
            .expect("count the sessions");

            assert_eq!(rows, 1, "one token is still one row");

            cleanup(&pool, &fixtures).await;
        });
    }

    #[test]
    fn every_granted_store_lists_and_revokes_the_shared_session() {
        with_database(|pool| async move {
            let fixtures = fixtures(&pool).await;
            let at = now();
            let digest = format!("d-{}", uuid::Uuid::new_v4());

            mcp_session_create(
                &pool,
                &NewMcpSession {
                    tenant_id: &fixtures.first,
                    member_id: &fixtures.member_id,
                    label: "claude — 2026-11-03",
                    client_name: "claude",
                    oauth_token_id: &fixtures.token_id,
                    token_digest: &digest,
                    last_used_at: at,
                    created_at: at,
                },
            )
            .await
            .expect("record the session on the first store");

            let listed = mcp_session_list(&pool, &fixtures.second)
                .await
                .expect("the second granted store lists it");
            assert_eq!(listed.len(), 1, "a granted store sees the one shared row");

            let session_id = listed[0].id.clone();

            assert!(
                mcp_session_find(&pool, &fixtures.second, &session_id)
                    .await
                    .expect("find from the second store")
                    .is_some()
            );
            assert!(
                mcp_session_list(&pool, &fixtures.outside)
                    .await
                    .expect("list from a store outside the grant")
                    .is_empty(),
                "a store the token was never granted sees nothing"
            );

            assert!(
                mcp_session_revoke(
                    &pool,
                    &fixtures.second,
                    &session_id,
                    &fixtures.token_id,
                    now(),
                )
                .await
                .expect("revoke from the second store")
            );
            assert!(
                mcp_session_list(&pool, &fixtures.first)
                    .await
                    .expect("list after the revoke")
                    .is_empty(),
                "a revoked row is no longer listed"
            );

            cleanup(&pool, &fixtures).await;
        });
    }
}
