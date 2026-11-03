//! team resource queries, ported from the Bun panel handler.
//!
//! `TenantMembership.memberId` is NOT NULL with a RESTRICT foreign key, so the
//! join always resolves and a membership can never produce a nameless row.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;

/// One membership with the member it names.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TeamMemberRow {
    pub member_id: String,
    pub name: Option<String>,
    pub email: String,
    pub kind: String,
    /// Free text in the column; the handler narrows it.
    pub role: String,
    pub joined_at: NaiveDateTime,
}

/// The store's team, oldest membership first.
pub async fn team_list(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<TeamMemberRow>, sqlx::Error> {
    sqlx::query_as::<_, TeamMemberRow>(
        r#"
        SELECT m.id AS member_id, m.name, m.email, m.kind,
               tm.role, tm."createdAt" AS joined_at
        FROM public."TenantMembership" tm
        JOIN public."Member" m ON m.id = tm."memberId"
        WHERE tm."tenantId" = $1
        ORDER BY tm."createdAt" ASC, tm.id ASC
        "#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}
