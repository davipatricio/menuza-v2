//! departments resource queries, ported from the Bun panel support.
//!
//! A department has no products of its own: it groups categories, and the item
//! count walks department → linked categories → subcategories → products.
//! Deactivating a department that still holds products moves them into a
//! destination category's `Geral` subcategory inside the same transaction.

use chrono::NaiveDateTime;
use sqlx::{PgConnection, PgPool};

use super::super::TenantId;

/// One row of the department list, with its product count.
pub struct DepartmentRow {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub items_count: i64,
    pub updated_at: NaiveDateTime,
}

/// The fields every department write carries.
pub struct DepartmentWrite<'a> {
    pub name: &'a str,
    pub active: bool,
    /// Where the products move when the department is deactivated.
    pub move_to: Option<&'a str>,
}

/// The list filters: an empty `term` and a `status` other than
/// `active`/`inactive` each mean "no restriction".
pub struct DepartmentFilter<'a> {
    pub term: &'a str,
    pub status: &'a str,
    pub sort_by: &'a str,
    pub order: &'a str,
}

/// Departments with their item counts, in the requested order.
pub async fn department_list(
    pool: &PgPool,
    tenant: &TenantId,
    filter: &DepartmentFilter<'_>,
) -> Result<Vec<DepartmentRow>, sqlx::Error> {
    type Row = (String, String, bool, i64, NaiveDateTime);

    let sql = format!(
        r#"SELECT d.id, d.name, d.active, d."updatedAt",
                  (SELECT count(*)
                     FROM "Product" p
                     JOIN "Subcategory" s
                       ON s.id = p."subcategoryId" AND s."tenantId" = p."tenantId"
                     JOIN "CategoryDepartment" cd
                       ON cd."categoryId" = s."categoryId" AND cd."tenantId" = p."tenantId"
                    WHERE p."tenantId" = d."tenantId" AND cd."departmentId" = d.id) AS items_count
             FROM "Department" d
            WHERE d."tenantId" = $1
              AND ($2 = '' OR strpos(lower(d.name), lower($2)) > 0)
              AND (($3 = 'active' AND d.active)
                OR ($3 = 'inactive' AND NOT d.active)
                OR $3 NOT IN ('active', 'inactive'))
            ORDER BY {}"#,
        order_clause(filter.sort_by, filter.order)
    );

    // The one interpolated piece is `order_clause`, whose arms are literals.
    let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .bind(filter.term)
        .bind(filter.status)
        .fetch_all(pool)
        .await?;

    Ok(rows
        .into_iter()
        .map(|row| DepartmentRow {
            id: row.0,
            name: row.1,
            active: row.2,
            items_count: row.3,
            updated_at: row.4,
        })
        .collect())
}

/// The stored name, or `None` when the department is not this store's.
pub async fn department_name(
    pool: &PgPool,
    tenant: &TenantId,
    department_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT name FROM "Department" WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(department_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| row.0))
}

/// Whether the store already holds a department with this name.
pub async fn department_name_taken(
    pool: &PgPool,
    tenant: &TenantId,
    name: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Department" WHERE "tenantId" = $1 AND name = $2"#,
    )
    .bind(tenant.as_str())
    .bind(name)
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// Inserts the department.
pub async fn department_create(
    pool: &PgPool,
    tenant: &TenantId,
    department_id: &str,
    write: &DepartmentWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "Department" (id, "tenantId", name, active, "updatedAt")
           VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(department_id)
    .bind(tenant.as_str())
    .bind(write.name)
    .bind(write.active)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Renames the department and flips its active flag. `false` means it holds
/// products and the destination category is missing, unknown or still linked to
/// the department; nothing is written then.
pub async fn department_update(
    pool: &PgPool,
    tenant: &TenantId,
    department_id: &str,
    write: &DepartmentWrite<'_>,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    if !write.active && product_count(&mut tx, tenant, department_id).await? > 0 {
        let Some(target_id) = write.move_to else {
            return Ok(false);
        };

        if !category_exists(&mut tx, tenant, target_id).await?
            || category_linked(&mut tx, tenant, department_id, target_id).await?
        {
            return Ok(false);
        }

        move_products(&mut tx, tenant, department_id, target_id, now).await?;
    }

    sqlx::query(
        r#"UPDATE "Department"
              SET name = $3, active = $4, "updatedAt" = $5
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(department_id)
    .bind(write.name)
    .bind(write.active)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(true)
}

/// Deletes the department. `false` means a category is still linked to it; the
/// link would silently disappear with the row.
pub async fn department_delete(
    pool: &PgPool,
    tenant: &TenantId,
    department_id: &str,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;

    let linked = sqlx::query_as::<_, (String,)>(
        r#"SELECT "categoryId"
             FROM "CategoryDepartment"
            WHERE "tenantId" = $1 AND "departmentId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(department_id)
    .fetch_optional(&mut *tx)
    .await?;

    if linked.is_some() {
        return Ok(false);
    }

    sqlx::query(r#"DELETE FROM "Department" WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(department_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(true)
}

/// Products inside the department, through its linked categories and their
/// subcategories.
async fn product_count(
    conn: &mut PgConnection,
    tenant: &TenantId,
    department_id: &str,
) -> Result<i64, sqlx::Error> {
    let row = sqlx::query_as::<_, (i64,)>(
        r#"SELECT count(*)
             FROM "Product" p
             JOIN "Subcategory" s
               ON s.id = p."subcategoryId" AND s."tenantId" = p."tenantId"
             JOIN "CategoryDepartment" cd
               ON cd."categoryId" = s."categoryId" AND cd."tenantId" = p."tenantId"
            WHERE p."tenantId" = $1 AND cd."departmentId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(department_id)
    .fetch_one(&mut *conn)
    .await?;

    Ok(row.0)
}

/// Whether the category exists in this store.
async fn category_exists(
    conn: &mut PgConnection,
    tenant: &TenantId,
    category_id: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Category" WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(category_id)
    .fetch_optional(&mut *conn)
    .await?;

    Ok(row.is_some())
}

/// Whether the category is linked to this department, which makes it a poor
/// destination: its products would move in a circle.
async fn category_linked(
    conn: &mut PgConnection,
    tenant: &TenantId,
    department_id: &str,
    category_id: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT "categoryId"
             FROM "CategoryDepartment"
            WHERE "tenantId" = $1 AND "departmentId" = $2 AND "categoryId" = $3"#,
    )
    .bind(tenant.as_str())
    .bind(department_id)
    .bind(category_id)
    .fetch_optional(&mut *conn)
    .await?;

    Ok(row.is_some())
}

/// Moves every product of the department into the target category's `Geral`
/// subcategory, creating it on first use.
async fn move_products(
    conn: &mut PgConnection,
    tenant: &TenantId,
    department_id: &str,
    target_category_id: &str,
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
    .bind(target_category_id)
    .bind(now)
    .execute(&mut *conn)
    .await?;

    sqlx::query(
        r#"UPDATE "Product" p
              SET "subcategoryId" = (
                    SELECT s.id
                      FROM "Subcategory" s
                     WHERE s."tenantId" = p."tenantId"
                       AND s."categoryId" = $3
                       AND s.name = 'Geral'
                     LIMIT 1),
                  "updatedAt" = $4
            WHERE p."tenantId" = $1
              AND p."subcategoryId" IN (
                    SELECT s.id
                      FROM "Subcategory" s
                      JOIN "CategoryDepartment" cd
                        ON cd."categoryId" = s."categoryId" AND cd."tenantId" = s."tenantId"
                     WHERE s."tenantId" = $1 AND cd."departmentId" = $2)"#,
    )
    .bind(tenant.as_str())
    .bind(department_id)
    .bind(target_category_id)
    .bind(now)
    .execute(&mut *conn)
    .await?;

    Ok(())
}

/// The `ORDER BY` body: every arm is a literal, never caller text.
fn order_clause(sort_by: &str, order: &str) -> &'static str {
    match (sort_by, order) {
        ("updatedAt", "desc") => r#"d."updatedAt" DESC, d.id ASC"#,
        ("updatedAt", _) => r#"d."updatedAt" ASC, d.id ASC"#,
        ("itemsCount", "desc") => r#"items_count DESC, d.name ASC, d.id ASC"#,
        ("itemsCount", _) => r#"items_count ASC, d.name ASC, d.id ASC"#,
        ("name", "desc") => r#"d.name DESC, d.id ASC"#,
        _ => r#"d.name ASC, d.id ASC"#,
    }
}
