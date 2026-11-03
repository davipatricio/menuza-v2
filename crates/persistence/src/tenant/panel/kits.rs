//! kits resource queries, ported from the Bun panel support.
//!
//! The panel only reads kits. The count is the number of `KitItem` rows the
//! kit holds, ordered by name.

use sqlx::PgPool;

use super::super::TenantId;

/// One row of the kit list.
pub struct KitRow {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub available: bool,
    pub items_count: i64,
}

/// Kits with their item counts, ordered by name.
pub async fn kit_list(pool: &PgPool, tenant: &TenantId) -> Result<Vec<KitRow>, sqlx::Error> {
    type Row = (String, String, String, bool, i64);

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT k.id, k.name, k.mode, k.available,
                  (SELECT count(*)
                     FROM "KitItem" ki
                    WHERE ki."tenantId" = k."tenantId" AND ki."kitId" = k.id) AS items_count
             FROM "Kit" k
            WHERE k."tenantId" = $1
            ORDER BY k.name ASC, k.id ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| KitRow {
            id: row.0,
            name: row.1,
            mode: row.2,
            available: row.3,
            items_count: row.4,
        })
        .collect())
}
