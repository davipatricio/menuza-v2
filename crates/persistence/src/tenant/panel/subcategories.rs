//! subcategories resource queries, ported from the Bun panel support.
//!
//! A subcategory belongs to one category of the store and is the level
//! products attach to, so the list joins the category name and counts the
//! products it holds.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;

/// One row of the subcategory list.
pub struct SubcategoryRow {
    pub id: String,
    pub name: String,
    pub category_id: String,
    pub category_name: String,
    pub active: bool,
    pub sort_order: i32,
    pub items_count: i64,
    pub updated_at: NaiveDateTime,
}

/// The fields a write compares against before replacing the row.
pub struct SubcategoryStored {
    pub name: String,
    pub category_id: String,
}

/// The fields every subcategory write carries.
pub struct SubcategoryWrite<'a> {
    pub name: &'a str,
    pub category_id: &'a str,
    pub sort_order: i32,
    pub active: bool,
}

/// The list filters: an empty `term`, `status` other than `active`/`inactive`
/// and an empty `category_id` each mean "no restriction".
pub struct SubcategoryFilter<'a> {
    pub term: &'a str,
    pub status: &'a str,
    pub category_id: &'a str,
    pub sort_by: &'a str,
    pub order: &'a str,
}

/// Subcategories with their category name and item counts, in the requested
/// order.
pub async fn subcategory_list(
    pool: &PgPool,
    tenant: &TenantId,
    filter: &SubcategoryFilter<'_>,
) -> Result<Vec<SubcategoryRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        String,
        bool,
        i32,
        NaiveDateTime,
        i64,
    );

    let sql = format!(
        r#"SELECT s.id, s.name, s."categoryId", COALESCE(c.name, ''),
                  s.active, s."sortOrder", s."updatedAt",
                  (SELECT count(*)
                     FROM "Product" p
                    WHERE p."tenantId" = s."tenantId" AND p."subcategoryId" = s.id) AS items_count
             FROM "Subcategory" s
             LEFT JOIN "Category" c
               ON c.id = s."categoryId" AND c."tenantId" = s."tenantId"
            WHERE s."tenantId" = $1
              AND ($2 = '' OR strpos(lower(s.name), lower($2)) > 0)
              AND (($3 = 'active' AND s.active)
                OR ($3 = 'inactive' AND NOT s.active)
                OR $3 NOT IN ('active', 'inactive'))
              AND ($4 = '' OR s."categoryId" = $4)
            ORDER BY {}"#,
        order_clause(filter.sort_by, filter.order)
    );

    // The one interpolated piece is `order_clause`, whose arms are literals.
    let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .bind(filter.term)
        .bind(filter.status)
        .bind(filter.category_id)
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|row| SubcategoryRow {
            id: row.0,
            name: row.1,
            category_id: row.2,
            category_name: row.3,
            active: row.4,
            sort_order: row.5,
            updated_at: row.6,
            items_count: row.7,
        })
        .collect())
}

/// The stored name and category, or `None` when the subcategory is not this
/// store's.
pub async fn subcategory_read(
    pool: &PgPool,
    tenant: &TenantId,
    subcategory_id: &str,
) -> Result<Option<SubcategoryStored>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String, String)>(
        r#"SELECT name, "categoryId" FROM "Subcategory" WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(subcategory_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| SubcategoryStored {
        name: row.0,
        category_id: row.1,
    }))
}

/// Whether the category exists in this store.
pub async fn subcategory_category_exists(
    pool: &PgPool,
    tenant: &TenantId,
    category_id: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Category" WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(category_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Whether the category already holds a subcategory with this name. `except`
/// is the row being updated, which must not match itself.
pub async fn subcategory_name_taken(
    pool: &PgPool,
    tenant: &TenantId,
    category_id: &str,
    name: &str,
    except: Option<&str>,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id
             FROM "Subcategory"
            WHERE "tenantId" = $1 AND "categoryId" = $2 AND name = $3
              AND ($4::text IS NULL OR id <> $4)"#,
    )
    .bind(tenant.as_str())
    .bind(category_id)
    .bind(name)
    .bind(except)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Inserts the subcategory.
pub async fn subcategory_create(
    pool: &PgPool,
    tenant: &TenantId,
    subcategory_id: &str,
    write: &SubcategoryWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "Subcategory" (id, "tenantId", "categoryId", name, "sortOrder", active, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(subcategory_id)
    .bind(tenant.as_str())
    .bind(write.category_id)
    .bind(write.name)
    .bind(write.sort_order)
    .bind(write.active)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Replaces every field of the subcategory.
pub async fn subcategory_update(
    pool: &PgPool,
    tenant: &TenantId,
    subcategory_id: &str,
    write: &SubcategoryWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"UPDATE "Subcategory"
              SET "categoryId" = $3, name = $4, "sortOrder" = $5, active = $6, "updatedAt" = $7
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(subcategory_id)
    .bind(write.category_id)
    .bind(write.name)
    .bind(write.sort_order)
    .bind(write.active)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Deletes the subcategory. `false` means a product still hangs off it; the
/// row is left untouched.
pub async fn subcategory_delete(
    pool: &PgPool,
    tenant: &TenantId,
    subcategory_id: &str,
) -> Result<bool, sqlx::Error> {
    if products(pool, tenant, subcategory_id).await? > 0 {
        return Ok(false);
    }

    sqlx::query(r#"DELETE FROM "Subcategory" WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(subcategory_id)
        .execute(pool)
        .await?;

    Ok(true)
}

/// Products attached to the subcategory.
async fn products(
    pool: &PgPool,
    tenant: &TenantId,
    subcategory_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query_as::<_, (i64,)>(
        r#"SELECT count(*)
             FROM "Product"
            WHERE "tenantId" = $1 AND "subcategoryId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(subcategory_id)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

/// The `ORDER BY` body: every arm is a literal, never caller text.
fn order_clause(sort_by: &str, order: &str) -> &'static str {
    match (sort_by, order) {
        ("name", "desc") => r#"s.name DESC, s.id ASC"#,
        ("name", _) => r#"s.name ASC, s.id ASC"#,
        ("updatedAt", "desc") => r#"s."updatedAt" DESC, s.id ASC"#,
        ("updatedAt", _) => r#"s."updatedAt" ASC, s.id ASC"#,
        ("itemsCount", "desc") => r#"items_count DESC, s.name ASC, s.id ASC"#,
        ("itemsCount", _) => r#"items_count ASC, s.name ASC, s.id ASC"#,
        ("sortOrder", "desc") => r#"s."sortOrder" DESC, s.id ASC"#,
        _ => r#"s."sortOrder" ASC, s.id ASC"#,
    }
}
