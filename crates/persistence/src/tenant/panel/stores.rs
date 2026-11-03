//! stores resource queries, ported from the Bun panel support.
//!
//! A store is a `Tenant`, and creating one also grants the creator the `owner`
//! membership. Both rows land in one transaction: a tenant without an owner
//! would be a store nobody can open.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;

/// The tenant fields the dashboard header shows.
pub struct StoreRow {
    pub slug: String,
    pub display_name: String,
}

/// The store behind an already-resolved tenant, or `None` when the row is gone.
pub async fn store_read(pool: &PgPool, tenant: &TenantId) -> Result<Option<StoreRow>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String, String)>(
        r#"SELECT slug, "displayName" FROM "Tenant" WHERE id = $1"#,
    )
    .bind(tenant.as_str())
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(slug, display_name)| StoreRow { slug, display_name }))
}

/// Whether a slug is already taken. The slug arrives before the tenant is
/// known, which is the host-style lookup `Scope::unscoped` exists for.
pub async fn store_slug_taken(pool: &PgPool, slug: &str) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(r#"SELECT id FROM "Tenant" WHERE slug = $1"#)
        .bind(slug)
        .fetch_optional(pool)
        .await?;

    Ok(row.is_some())
}

/// Creates the tenant and the creator's `owner` membership. `false` means the
/// slug was taken by a concurrent create; the transaction then rolls back
/// untouched, so no half-created store is left behind.
pub async fn store_create(
    pool: &PgPool,
    tenant: &TenantId,
    slug: &str,
    display_name: &str,
    member_id: &str,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let inserted = sqlx::query(
        r#"INSERT INTO "Tenant" (id, slug, "displayName", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT (slug) DO NOTHING"#,
    )
    .bind(tenant.as_str())
    .bind(slug)
    .bind(display_name)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    if inserted.rows_affected() == 0 {
        return Ok(false);
    }

    sqlx::query(
        r#"INSERT INTO "TenantMembership" (id, "memberId", "tenantId", role, "createdAt")
           VALUES ($1, $2, $3, 'owner', $4)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(member_id)
    .bind(tenant.as_str())
    .bind(now)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(true)
}
