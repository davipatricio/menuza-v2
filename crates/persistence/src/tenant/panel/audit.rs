//! audit resource queries, ported from the Bun panel handler.
//!
//! The trail is append-only and `action` is free text until MEN-74 closes the
//! event catalog, so nothing narrows the rows here.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;

/// One line of the store's audit trail.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AuditLogRow {
    pub id: String,
    pub action: String,
    pub actor: String,
    pub target: String,
    pub ip: String,
    pub created_at: NaiveDateTime,
}

/// The store's trail, newest first.
pub async fn audit_log_list(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<AuditLogRow>, sqlx::Error> {
    sqlx::query_as::<_, AuditLogRow>(
        r#"
        SELECT id, action, actor, target, ip, "createdAt" AS created_at
        FROM public."AuditLog"
        WHERE "tenantId" = $1
        ORDER BY "createdAt" DESC, id DESC
        "#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}
