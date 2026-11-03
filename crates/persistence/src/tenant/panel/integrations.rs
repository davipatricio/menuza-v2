//! integrations resource queries, ported from the Bun panel support.
//!
//! `StoreIntegration` holds one row per `(tenantId, integrationId)`: the status
//! and the config blob. The catalog itself is code in `contract`, so this module
//! only moves the per-store state and never invents an integration.
//!
//! `McpSession` rows are the dashboard MCP clients; revoking one has to drop the
//! `OAuthToken` it was issued from too, or the handle disappears while its
//! bearer token keeps working.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;
use crate::tenant::begin_scoped;

/// The `integrationId` the dashboard MCP sessions belong to.
const MCP_DASHBOARD: &str = "mcp-dashboard";

/// One stored integration state.
pub struct StoreIntegrationRow {
    pub id: String,
    pub integration_id: String,
    pub status: String,
    pub config: Option<String>,
    pub enabled_at: Option<NaiveDateTime>,
    pub updated_at: NaiveDateTime,
}

/// One connected MCP client, joined to the member that created it.
pub struct McpSessionRow {
    pub id: String,
    pub label: String,
    pub client_name: String,
    pub member_name: String,
    pub created_at: NaiveDateTime,
    pub last_used_at: Option<NaiveDateTime>,
}

/// The two ids a revocation touches.
pub struct McpSessionTarget {
    pub id: String,
    pub oauth_token_id: String,
}

/// Every integration this store has touched, in catalog order is the caller's.
pub async fn store_integration_list(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<StoreIntegrationRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        Option<String>,
        Option<NaiveDateTime>,
        NaiveDateTime,
    );

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT id, "integrationId", status, config, "enabledAt", "updatedAt"
             FROM "StoreIntegration"
            WHERE "tenantId" = $1
            ORDER BY "createdAt" ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, integration_id, status, config, enabled_at, updated_at)| StoreIntegrationRow {
                id,
                integration_id,
                status,
                config,
                enabled_at,
                updated_at,
            },
        )
        .collect())
}

/// This store's row for one catalog integration, or `None` when it never saved
/// one.
pub async fn store_integration_find(
    pool: &PgPool,
    tenant: &TenantId,
    integration_id: &str,
) -> Result<Option<StoreIntegrationRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        Option<String>,
        Option<NaiveDateTime>,
        NaiveDateTime,
    );

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, "integrationId", status, config, "enabledAt", "updatedAt"
             FROM "StoreIntegration"
            WHERE "tenantId" = $1 AND "integrationId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(integration_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(id, integration_id, status, config, enabled_at, updated_at)| StoreIntegrationRow {
            id,
            integration_id,
            status,
            config,
            enabled_at,
            updated_at,
        },
    ))
}

/// Inserts the store's first state for an integration.
pub async fn store_integration_create(
    pool: &PgPool,
    tenant: &TenantId,
    integration_id: &str,
    status: &str,
    config: &str,
    enabled_at: Option<NaiveDateTime>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "StoreIntegration"
               (id, "tenantId", "integrationId", status, config, "enabledAt",
                "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(integration_id)
    .bind(status)
    .bind(config)
    .bind(enabled_at)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Replaces the status, config and first-enable stamp of an existing row.
pub async fn store_integration_update(
    pool: &PgPool,
    tenant: &TenantId,
    integration_id: &str,
    status: &str,
    config: &str,
    enabled_at: Option<NaiveDateTime>,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query(
        r#"UPDATE "StoreIntegration"
              SET status = $3,
                  config = $4,
                  "enabledAt" = $5,
                  "updatedAt" = $6
            WHERE "tenantId" = $1 AND "integrationId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(integration_id)
    .bind(status)
    .bind(config)
    .bind(enabled_at)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(updated.rows_affected() > 0)
}

/// The live dashboard MCP sessions, oldest first. A revoked row is history the
/// audit log already owns, so it is not listed.
///
/// A session is visible from every store the token was granted, not only the
/// store it was first seen on: the row is keyed by the digest alone.
pub async fn mcp_session_list(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<McpSessionRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        String,
        NaiveDateTime,
        Option<NaiveDateTime>,
    );

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT s.id, s.label, s."clientName",
                  COALESCE(m.name, m.email) AS member_name,
                  s."createdAt", s."lastUsedAt"
             FROM "McpSession" s
             JOIN "Member" m ON m.id = s."memberId"
             LEFT JOIN "OAuthToken" t ON t.id = s."oauthTokenId"
            WHERE s."integrationId" = $2
              AND s."revokedAt" IS NULL
              AND (s."tenantId" = $1 OR $1 = ANY(t."tenantIds"))
            ORDER BY s."createdAt" ASC"#,
    )
    .bind(tenant.as_str())
    .bind(MCP_DASHBOARD)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(id, label, client_name, member_name, created_at, last_used_at)| McpSessionRow {
                id,
                label,
                client_name,
                member_name,
                created_at,
                last_used_at,
            },
        )
        .collect())
}

/// One session scoped to the store in the path, with the token it was issued
/// from. Matched the same way as the list: any store the token was granted.
pub async fn mcp_session_find(
    pool: &PgPool,
    tenant: &TenantId,
    session_id: &str,
) -> Result<Option<McpSessionTarget>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String, String)>(
        r#"SELECT s.id, s."oauthTokenId"
             FROM "McpSession" s
             LEFT JOIN "OAuthToken" t ON t.id = s."oauthTokenId"
            WHERE s.id = $2
              AND s."integrationId" = $3
              AND s."revokedAt" IS NULL
              AND (s."tenantId" = $1 OR $1 = ANY(t."tenantIds"))"#,
    )
    .bind(tenant.as_str())
    .bind(session_id)
    .bind(MCP_DASHBOARD)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id, oauth_token_id)| McpSessionTarget { id, oauth_token_id }))
}

/// Revokes the session and the token it uses, in one transaction.
///
/// The session is matched the same way as [`mcp_session_find`], so a session
/// listed from a granted store revokes from that store. The token row is
/// matched on `id` alone: `OAuthToken.tenantIds` is an array, and a tenant
/// filter that matched nothing would leave a working bearer token behind while
/// the list stopped showing it. The id came from a session already scoped to
/// this store, and dropping the credential is the security-critical half.
/// `false` means the session was already gone.
pub async fn mcp_session_revoke(
    pool: &PgPool,
    tenant: &TenantId,
    session_id: &str,
    oauth_token_id: &str,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let revoked = sqlx::query(
        r#"UPDATE "McpSession" s
              SET "revokedAt" = $3
            WHERE s.id = $2
              AND (s."tenantId" = $1
                   OR EXISTS (SELECT 1
                                FROM "OAuthToken" t
                               WHERE t.id = s."oauthTokenId"
                                 AND $1 = ANY(t."tenantIds")))"#,
    )
    .bind(tenant.as_str())
    .bind(session_id)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    if revoked.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(r#"UPDATE "OAuthToken" SET "revokedAt" = $2 WHERE id = $1"#)
        .bind(oauth_token_id)
        .bind(now)
        .execute(&mut **tx)
        .await?;

    tx.commit().await?;

    Ok(true)
}
