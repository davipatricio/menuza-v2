//! badges resource queries, ported from the Bun panel support.
//!
//! A badge is a name, an image URL and a display order. The list counts the
//! `ProductBadge` links, and the update is partial: a field the caller omitted
//! keeps its stored value.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;

/// One row of the badge list, with its product count.
pub struct BadgeRow {
    pub id: String,
    pub name: String,
    pub image_url: String,
    pub sort_order: i32,
    pub is_active: bool,
    pub items_count: i64,
}

/// The stored fields a partial update merges into.
pub struct BadgeStored {
    pub name: String,
    pub image_url: String,
    pub sort_order: i32,
    pub is_active: bool,
}

/// The fully merged row every badge write stores.
pub struct BadgeWrite<'a> {
    pub name: &'a str,
    pub image_url: &'a str,
    pub sort_order: i32,
    pub is_active: bool,
}

/// Badges with their item counts, ordered by display order then name.
pub async fn badge_list(pool: &PgPool, tenant: &TenantId) -> Result<Vec<BadgeRow>, sqlx::Error> {
    type Row = (String, String, String, i32, bool, i64);

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT b.id, b.name, b."imageUrl", b."sortOrder", b."isActive",
                  (SELECT count(*)
                     FROM "ProductBadge" pb
                    WHERE pb."tenantId" = b."tenantId" AND pb."badgeId" = b.id) AS items_count
             FROM "Badge" b
            WHERE b."tenantId" = $1
            ORDER BY b."sortOrder" ASC, b.name ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| BadgeRow {
            id: row.0,
            name: row.1,
            image_url: row.2,
            sort_order: row.3,
            is_active: row.4,
            items_count: row.5,
        })
        .collect())
}

/// The stored badge, or `None` when it is not this store's.
pub async fn badge_read(
    pool: &PgPool,
    tenant: &TenantId,
    badge_id: &str,
) -> Result<Option<BadgeStored>, sqlx::Error> {
    type Row = (String, String, i32, bool);

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT name, "imageUrl", "sortOrder", "isActive"
             FROM "Badge"
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(badge_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| BadgeStored {
        name: row.0,
        image_url: row.1,
        sort_order: row.2,
        is_active: row.3,
    }))
}

/// Whether the store already holds a badge with this name.
pub async fn badge_name_taken(
    pool: &PgPool,
    tenant: &TenantId,
    name: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Badge" WHERE "tenantId" = $1 AND name = $2"#,
    )
    .bind(tenant.as_str())
    .bind(name)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Inserts the badge.
pub async fn badge_create(
    pool: &PgPool,
    tenant: &TenantId,
    badge_id: &str,
    write: &BadgeWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "Badge" (id, "tenantId", name, "imageUrl", "sortOrder", "isActive", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(badge_id)
    .bind(tenant.as_str())
    .bind(write.name)
    .bind(write.image_url)
    .bind(write.sort_order)
    .bind(write.is_active)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Writes the merged row whole, so a partial save never loses a column.
pub async fn badge_update(
    pool: &PgPool,
    tenant: &TenantId,
    badge_id: &str,
    write: &BadgeWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE "Badge"
              SET name = $3, "imageUrl" = $4, "sortOrder" = $5, "isActive" = $6, "updatedAt" = $7
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(badge_id)
    .bind(write.name)
    .bind(write.image_url)
    .bind(write.sort_order)
    .bind(write.is_active)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Deletes the badge; its `ProductBadge` links cascade with it.
pub async fn badge_delete(
    pool: &PgPool,
    tenant: &TenantId,
    badge_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"DELETE FROM "Badge" WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(badge_id)
        .execute(pool)
        .await?;

    Ok(())
}
