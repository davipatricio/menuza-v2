//! categories resource queries, ported from the Bun panel support.
//!
//! A category owns its department links and its `Geral` subcategory: the rows,
//! the links and the fallback subcategory land in one transaction, and a write
//! names a department the store does not own is refused before anything is
//! inserted.

use std::collections::HashSet;

use chrono::NaiveDateTime;
use sqlx::{PgConnection, PgPool};

use super::super::TenantId;

/// One row of the category list, with its product count.
pub struct CategoryRow {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub sort_order: i32,
    pub items_count: i64,
    pub updated_at: NaiveDateTime,
}

/// One category → department link, joined to the department name.
pub struct CategoryLink {
    pub category_id: String,
    pub department_id: String,
    pub department_name: String,
}

/// The fields every category write carries.
pub struct CategoryWrite<'a> {
    pub name: &'a str,
    pub sort_order: i32,
    pub active: bool,
    pub department_ids: &'a [String],
}

/// The list filters: an empty `term`, `status` other than `active`/`inactive`
/// and an empty `department_id` each mean "no restriction".
pub struct CategoryFilter<'a> {
    pub term: &'a str,
    pub status: &'a str,
    pub department_id: &'a str,
    pub sort_by: &'a str,
    pub order: &'a str,
}

/// Categories with their item counts, in the requested order.
pub async fn category_list(
    pool: &PgPool,
    tenant: &TenantId,
    filter: &CategoryFilter<'_>,
) -> Result<Vec<CategoryRow>, sqlx::Error> {
    type Row = (String, String, bool, i32, NaiveDateTime, i64);

    let sql = format!(
        r#"SELECT c.id, c.name, c.active, c."sortOrder", c."updatedAt",
                  (SELECT count(*)
                     FROM "Product" p
                     JOIN "Subcategory" s
                       ON s.id = p."subcategoryId" AND s."tenantId" = p."tenantId"
                    WHERE p."tenantId" = c."tenantId" AND s."categoryId" = c.id) AS items_count
             FROM "Category" c
            WHERE c."tenantId" = $1
              AND ($2 = '' OR strpos(lower(c.name), lower($2)) > 0)
              AND (($3 = 'active' AND c.active)
                OR ($3 = 'inactive' AND NOT c.active)
                OR $3 NOT IN ('active', 'inactive'))
              AND ($4 = '' OR EXISTS (
                    SELECT 1
                      FROM "CategoryDepartment" cd
                     WHERE cd."tenantId" = c."tenantId"
                       AND cd."categoryId" = c.id
                       AND cd."departmentId" = $4))
            ORDER BY {}"#,
        order_clause(filter.sort_by, filter.order)
    );

    // The one interpolated piece is `order_clause`, whose arms are literals.
    let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .bind(filter.term)
        .bind(filter.status)
        .bind(filter.department_id)
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|row| CategoryRow {
            id: row.0,
            name: row.1,
            active: row.2,
            sort_order: row.3,
            updated_at: row.4,
            items_count: row.5,
        })
        .collect())
}

/// Every link of the store, ordered by department name.
pub async fn category_departments(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<CategoryLink>, sqlx::Error> {
    type Row = (String, String, String);

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT cd."categoryId", cd."departmentId", d.name
             FROM "CategoryDepartment" cd
             JOIN "Department" d
               ON d.id = cd."departmentId" AND d."tenantId" = cd."tenantId"
            WHERE cd."tenantId" = $1
            ORDER BY d.name ASC, cd."departmentId" ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| CategoryLink {
            category_id: row.0,
            department_id: row.1,
            department_name: row.2,
        })
        .collect())
}

/// The stored name, or `None` when the category is not this store's.
pub async fn category_name(
    pool: &PgPool,
    tenant: &TenantId,
    category_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT name FROM "Category" WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(category_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| row.0))
}

/// Whether the store already holds a category with this name.
pub async fn category_name_taken(
    pool: &PgPool,
    tenant: &TenantId,
    name: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Category" WHERE "tenantId" = $1 AND name = $2"#,
    )
    .bind(tenant.as_str())
    .bind(name)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Creates the category, its department links and its `Geral` subcategory.
/// `false` means a listed department is not the store's; the transaction then
/// rolls back untouched.
pub async fn category_create(
    pool: &PgPool,
    tenant: &TenantId,
    category_id: &str,
    write: &CategoryWrite<'_>,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    if !departments_owned(&mut tx, tenant, write.department_ids).await? {
        return Ok(false);
    }

    sqlx::query(
        r#"INSERT INTO "Category" (id, "tenantId", name, "sortOrder", active, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6)"#,
    )
    .bind(category_id)
    .bind(tenant.as_str())
    .bind(write.name)
    .bind(write.sort_order)
    .bind(write.active)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    link_departments(&mut tx, tenant, category_id, write.department_ids).await?;
    general_subcategory(&mut tx, tenant, category_id, now).await?;

    tx.commit().await?;

    Ok(true)
}

/// Replaces every field and the whole department set. `false` means a listed
/// department is not the store's.
pub async fn category_update(
    pool: &PgPool,
    tenant: &TenantId,
    category_id: &str,
    write: &CategoryWrite<'_>,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    if !departments_owned(&mut tx, tenant, write.department_ids).await? {
        return Ok(false);
    }

    sqlx::query(
        r#"UPDATE "Category"
              SET name = $3, "sortOrder" = $4, active = $5, "updatedAt" = $6
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(category_id)
    .bind(write.name)
    .bind(write.sort_order)
    .bind(write.active)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(r#"DELETE FROM "CategoryDepartment" WHERE "tenantId" = $1 AND "categoryId" = $2"#)
        .bind(tenant.as_str())
        .bind(category_id)
        .execute(&mut *tx)
        .await?;

    link_departments(&mut tx, tenant, category_id, write.department_ids).await?;

    tx.commit().await?;

    Ok(true)
}

/// Deletes the category; the subcategories and links cascade. `false` means a
/// product still hangs off one of its subcategories.
pub async fn category_delete(
    pool: &PgPool,
    tenant: &TenantId,
    category_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    if product_count(&mut tx, tenant, category_id).await? > 0 {
        return Ok(false);
    }

    sqlx::query(r#"DELETE FROM "Category" WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(category_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(true)
}

/// Every id must name a department of this store.
async fn departments_owned(
    conn: &mut PgConnection,
    tenant: &TenantId,
    department_ids: &[String],
) -> Result<bool, sqlx::Error> {
    for department_id in department_ids.iter().collect::<HashSet<_>>() {
        let row = sqlx::query_as::<_, (String,)>(
            r#"SELECT id FROM "Department" WHERE "tenantId" = $1 AND id = $2"#,
        )
        .bind(tenant.as_str())
        .bind(department_id.as_str())
        .fetch_optional(&mut *conn)
        .await?;

        if row.is_none() {
            return Ok(false);
        }
    }

    Ok(true)
}

/// Inserts one link per distinct department.
async fn link_departments(
    conn: &mut PgConnection,
    tenant: &TenantId,
    category_id: &str,
    department_ids: &[String],
) -> Result<(), sqlx::Error> {
    for department_id in department_ids.iter().collect::<HashSet<_>>() {
        sqlx::query(
            r#"INSERT INTO "CategoryDepartment" ("tenantId", "categoryId", "departmentId")
               VALUES ($1, $2, $3)"#,
        )
        .bind(tenant.as_str())
        .bind(category_id)
        .bind(department_id.as_str())
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}

/// The `Geral` subcategory every category receives on first use.
async fn general_subcategory(
    conn: &mut PgConnection,
    tenant: &TenantId,
    category_id: &str,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "Subcategory" (id, "tenantId", "categoryId", name, "sortOrder", active, "updatedAt")
           SELECT $1, $2, $3, 'Geral', 0, true, $4
            WHERE NOT EXISTS (
                  SELECT 1
                    FROM "Subcategory"
                   WHERE "tenantId" = $2 AND "categoryId" = $3 AND name = 'Geral')"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(category_id)
    .bind(now)
    .execute(&mut *conn)
    .await?;

    Ok(())
}

/// Products attached to the category, through its subcategories.
async fn product_count(
    conn: &mut PgConnection,
    tenant: &TenantId,
    category_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query_as::<_, (i64,)>(
        r#"SELECT count(*)
             FROM "Product" p
             JOIN "Subcategory" s
               ON s.id = p."subcategoryId" AND s."tenantId" = p."tenantId"
            WHERE p."tenantId" = $1 AND s."categoryId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(category_id)
    .fetch_one(&mut *conn)
    .await?;

    Ok(row.0)
}

/// The `ORDER BY` body: every arm is a literal, never caller text.
fn order_clause(sort_by: &str, order: &str) -> &'static str {
    match (sort_by, order) {
        ("name", "desc") => r#"c.name DESC, c.id ASC"#,
        ("name", _) => r#"c.name ASC, c.id ASC"#,
        ("updatedAt", "desc") => r#"c."updatedAt" DESC, c.id ASC"#,
        ("updatedAt", _) => r#"c."updatedAt" ASC, c.id ASC"#,
        ("itemsCount", "desc") => r#"items_count DESC, c.name ASC, c.id ASC"#,
        ("itemsCount", _) => r#"items_count ASC, c.name ASC, c.id ASC"#,
        ("sortOrder", "desc") => r#"c."sortOrder" DESC, c.id ASC"#,
        _ => r#"c."sortOrder" ASC, c.id ASC"#,
    }
}
