//! tags resource queries, ported from the Bun panel support.
//!
//! A tag is a name plus a visibility flag. Its item count is the number of
//! `ProductTag` links, and a tag still linked to a product cannot be deleted.

use sqlx::PgPool;

use super::super::TenantId;

/// One row of the tag list, with its product count.
pub struct TagRow {
    pub id: String,
    pub name: String,
    pub is_active: bool,
    pub items_count: i64,
}

/// Tags with their item counts, in the requested order.
pub async fn tag_list(
    pool: &PgPool,
    tenant: &TenantId,
    sort_by: &str,
    order: &str,
) -> Result<Vec<TagRow>, sqlx::Error> {
    type Row = (String, String, bool, i64);

    let sql = format!(
        r#"SELECT t.id, t.name, t."isActive",
                  (SELECT count(*)
                     FROM "ProductTag" pt
                    WHERE pt."tenantId" = t."tenantId" AND pt."tagId" = t.id) AS items_count
             FROM "Tag" t
            WHERE t."tenantId" = $1
            ORDER BY {}"#,
        order_clause(sort_by, order)
    );

    // The one interpolated piece is `order_clause`, whose arms are literals.
    let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|row| TagRow {
            id: row.0,
            name: row.1,
            is_active: row.2,
            items_count: row.3,
        })
        .collect())
}

/// The stored name, or `None` when the tag is not this store's.
pub async fn tag_name(
    pool: &PgPool,
    tenant: &TenantId,
    tag_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT name FROM "Tag" WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(tag_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| row.0))
}

/// Whether the store already holds a tag with this name.
pub async fn tag_name_taken(
    pool: &PgPool,
    tenant: &TenantId,
    name: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Tag" WHERE "tenantId" = $1 AND name = $2"#,
    )
    .bind(tenant.as_str())
    .bind(name)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Inserts the tag.
pub async fn tag_create(
    pool: &PgPool,
    tenant: &TenantId,
    tag_id: &str,
    name: &str,
    is_active: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "Tag" (id, "tenantId", name, "isActive")
           VALUES ($1, $2, $3, $4)"#,
    )
    .bind(tag_id)
    .bind(tenant.as_str())
    .bind(name)
    .bind(is_active)
    .execute(pool)
    .await?;

    Ok(())
}

/// Replaces the tag's name and visibility.
pub async fn tag_update(
    pool: &PgPool,
    tenant: &TenantId,
    tag_id: &str,
    name: &str,
    is_active: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "Tag" SET name = $3, "isActive" = $4 WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(tag_id)
        .bind(name)
        .bind(is_active)
        .execute(pool)
        .await?;

    Ok(())
}

/// Deletes the tag. `false` means a product still carries it; the row is left
/// untouched.
pub async fn tag_delete(
    pool: &PgPool,
    tenant: &TenantId,
    tag_id: &str,
) -> Result<bool, sqlx::Error> {
    let linked = sqlx::query_as::<_, (String,)>(
        r#"SELECT "productId"
             FROM "ProductTag"
            WHERE "tenantId" = $1 AND "tagId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(tag_id)
    .fetch_optional(pool)
    .await?;

    if linked.is_some() {
        return Ok(false);
    }

    sqlx::query(r#"DELETE FROM "Tag" WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(tag_id)
        .execute(pool)
        .await?;

    Ok(true)
}

/// The `ORDER BY` body: every arm is a literal, never caller text.
fn order_clause(sort_by: &str, order: &str) -> &'static str {
    match (sort_by, order) {
        ("itemsCount", "desc") => r#"items_count DESC, t.name ASC, t.id ASC"#,
        ("itemsCount", _) => r#"items_count ASC, t.name ASC, t.id ASC"#,
        ("name", "desc") => r#"t.name DESC, t.id ASC"#,
        _ => r#"t.name ASC, t.id ASC"#,
    }
}
