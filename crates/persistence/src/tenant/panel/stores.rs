//! stores resource queries, ported from the Bun panel support.
//!
//! A store is a `Tenant`, and creating one also grants the creator the `owner`
//! membership. Both rows land in one transaction: a tenant without an owner
//! would be a store nobody can open.

use chrono::NaiveDateTime;
use contract::tenant::panel::stores::{PanelTheme, SaveThemeInput};
use domain::theme;
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
///
/// An archived tenant still counts: its slug is the address of orders that were
/// already issued, so a new store must not inherit it.
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

/// The store's palette: its saved values, or the platform defaults when the row
/// or a column is missing. The foreground is derived, never read.
pub async fn theme_read(pool: &PgPool, tenant: &TenantId) -> Result<PanelTheme, sqlx::Error> {
    let row = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>, Option<i32>)>(
        r#"SELECT "primaryColor", "accentColor", "backgroundColor", radius
           FROM "StoreSettings"
           WHERE "tenantId" = $1"#,
    )
    .bind(tenant.as_str())
    .fetch_optional(pool)
    .await?;

    let (primary, accent, background, radius) = row.unwrap_or((None, None, None, None));
    let resolved = theme::resolve(
        primary.as_deref(),
        accent.as_deref(),
        background.as_deref(),
        radius,
    );

    Ok(PanelTheme {
        primary_color: resolved.primary_color,
        primary_foreground: resolved.primary_foreground,
        accent_color: resolved.accent_color,
        background_color: resolved.background_color,
        foreground_color: resolved.foreground_color,
        radius: resolved.radius,
    })
}

/// Writes the palette on the store's settings row, creating it when absent.
///
/// The SEO columns are untouched: an upsert lists exactly the columns it owns,
/// so saving a theme never clears a template saved by the SEO screen.
pub async fn theme_save(
    pool: &PgPool,
    tenant: &TenantId,
    input: &SaveThemeInput,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "StoreSettings"
               (id, "tenantId", "primaryColor", "accentColor", "backgroundColor", radius,
                "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
           ON CONFLICT ("tenantId")
           DO UPDATE SET "primaryColor" = EXCLUDED."primaryColor",
                         "accentColor" = EXCLUDED."accentColor",
                         "backgroundColor" = EXCLUDED."backgroundColor",
                         radius = EXCLUDED.radius,
                         "updatedAt" = EXCLUDED."updatedAt""#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(&input.primary_color)
    .bind(&input.accent_color)
    .bind(&input.background_color)
    .bind(input.radius)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}
