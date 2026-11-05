//! kits resource queries.
//!
//! A kit owns no stock: every dish entry names a variation, and the checkout
//! debits the chosen variations. The panel reads the whole kit in one go and
//! replaces the full set of groups, dishes and bands on every write, so a
//! half-updated composition never exists.
//!
//! Group ids are minted here, not taken from the payload: the editor only needs
//! them to bind a dish to a group inside one request, and a client-chosen id
//! could collide with another store's group.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::{TenantId, begin_scoped};

/// One row of the kit list.
pub struct KitRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub kind: String,
    pub pricing_mode: String,
    pub base_cents: i32,
    pub percent_off: Option<i32>,
    pub available: bool,
    pub archived: bool,
    pub items_count: i64,
    pub updated_at: NaiveDateTime,
}

/// The kit row the editor loads.
#[derive(sqlx::FromRow)]
pub struct KitDetailRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    #[sqlx(rename = "imageUrl")]
    pub image_url: String,
    pub kind: String,
    #[sqlx(rename = "pricingMode")]
    pub pricing_mode: String,
    #[sqlx(rename = "baseCents")]
    pub base_cents: i32,
    #[sqlx(rename = "percentOff")]
    pub percent_off: Option<i32>,
    #[sqlx(rename = "minItems")]
    pub min_items: Option<i32>,
    #[sqlx(rename = "maxItems")]
    pub max_items: Option<i32>,
    #[sqlx(rename = "maxKitsPerOrder")]
    pub max_kits_per_order: Option<i32>,
    #[sqlx(rename = "unavailableBehavior")]
    pub unavailable_behavior: String,
    #[sqlx(rename = "couponStackable")]
    pub coupon_stackable: bool,
    #[sqlx(rename = "sortOrder")]
    pub sort_order: i32,
    pub available: bool,
    pub archived: bool,
    #[sqlx(rename = "updatedAt")]
    pub updated_at: NaiveDateTime,
}

/// One group of the kit.
#[derive(sqlx::FromRow)]
pub struct KitGroupRow {
    pub id: String,
    pub name: String,
    #[sqlx(rename = "minItems")]
    pub min_items: Option<i32>,
    #[sqlx(rename = "maxItems")]
    pub max_items: Option<i32>,
    #[sqlx(rename = "sortOrder")]
    pub sort_order: i32,
}

/// One dish of the kit, with the names the editor shows.
#[derive(sqlx::FromRow)]
pub struct KitItemRow {
    pub id: String,
    #[sqlx(rename = "productId")]
    pub product_id: String,
    pub product_name: Option<String>,
    #[sqlx(rename = "variationId")]
    pub variation_id: String,
    pub variation_name: Option<String>,
    #[sqlx(rename = "groupId")]
    pub group_id: Option<String>,
    pub quantity: Option<i32>,
    #[sqlx(rename = "minQty")]
    pub min_qty: Option<i32>,
    #[sqlx(rename = "maxQty")]
    pub max_qty: Option<i32>,
    pub step: i32,
    #[sqlx(rename = "allowSwap")]
    pub allow_swap: bool,
    #[sqlx(rename = "sortOrder")]
    pub sort_order: i32,
}

/// One progressive band.
#[derive(sqlx::FromRow)]
pub struct KitBandRow {
    pub id: String,
    #[sqlx(rename = "minQuantity")]
    pub min_quantity: i32,
    pub percent: i32,
}

/// Everything the editor sends for one kit, after the handler narrowed the
/// contract types. `group.client_id` is only a within-payload reference.
pub struct KitWrite<'a> {
    pub name: &'a str,
    pub slug: &'a str,
    pub description: Option<&'a str>,
    pub image_url: &'a str,
    pub kind: &'a str,
    pub pricing_mode: &'a str,
    pub base_cents: i32,
    pub percent_off: Option<i32>,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
    pub max_kits_per_order: Option<i32>,
    pub unavailable_behavior: &'a str,
    pub coupon_stackable: bool,
    pub sort_order: i32,
    pub available: bool,
    pub archived: bool,
    pub groups: Vec<KitGroupWrite<'a>>,
    pub items: Vec<KitItemWrite<'a>>,
    pub bands: Vec<KitBandWrite>,
}

/// A group as the payload names it.
pub struct KitGroupWrite<'a> {
    pub client_id: &'a str,
    pub name: &'a str,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
    pub sort_order: i32,
}

/// A dish as the payload names it.
pub struct KitItemWrite<'a> {
    pub product_id: &'a str,
    pub variation_id: &'a str,
    pub group_client_id: Option<&'a str>,
    pub quantity: Option<i32>,
    pub min_qty: Option<i32>,
    pub max_qty: Option<i32>,
    pub step: i32,
    pub allow_swap: bool,
    pub swap_variation_ids: &'a [String],
    pub sort_order: i32,
}

/// A band as the payload names it.
pub struct KitBandWrite {
    pub min_quantity: i32,
    pub percent: i32,
}

/// A whole kit: the row, its groups, its dishes and their alternate variations,
/// and its bands.
pub struct KitDetail {
    pub kit: KitDetailRow,
    pub groups: Vec<KitGroupRow>,
    pub items: Vec<KitItemRow>,
    /// `kitItemId` → the variations the manager allows in its place.
    pub swaps: std::collections::HashMap<String, Vec<String>>,
    pub bands: Vec<KitBandRow>,
}

/// Kits with their dish counts, ordered by `sortOrder` then name.
pub async fn kit_list(pool: &PgPool, tenant: &TenantId) -> Result<Vec<KitRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        String,
        String,
        i32,
        Option<i32>,
        bool,
        bool,
        i64,
        NaiveDateTime,
    );

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT k.id, k.name, k.slug, k.kind, k."pricingMode", k."baseCents",
                  k."percentOff", k.available, k.archived,
                  (SELECT count(*)
                     FROM "KitItem" ki
                    WHERE ki."tenantId" = k."tenantId" AND ki."kitId" = k.id) AS items_count,
                  k."updatedAt"
             FROM "Kit" k
            WHERE k."tenantId" = $1
            ORDER BY k."sortOrder" ASC, k.name ASC, k.id ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| KitRow {
            id: row.0,
            name: row.1,
            slug: row.2,
            kind: row.3,
            pricing_mode: row.4,
            base_cents: row.5,
            percent_off: row.6,
            available: row.7,
            archived: row.8,
            items_count: row.9,
            updated_at: row.10,
        })
        .collect())
}

/// The editor's read, or `None` when the id is not this store's.
pub async fn kit_get(
    pool: &PgPool,
    tenant: &TenantId,
    kit_id: &str,
) -> Result<Option<KitDetail>, sqlx::Error> {
    let kit = sqlx::query_as::<_, KitDetailRow>(
        r#"SELECT id, name, slug, description, "imageUrl", kind, "pricingMode",
                  "baseCents", "percentOff", "minItems", "maxItems",
                  "maxKitsPerOrder", "unavailableBehavior", "couponStackable",
                  "sortOrder", available, archived, "updatedAt"
             FROM "Kit"
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(kit_id)
    .fetch_optional(pool)
    .await?;

    let Some(kit) = kit else {
        return Ok(None);
    };

    let groups = sqlx::query_as::<_, KitGroupRow>(
        r#"SELECT id, name, "minItems", "maxItems", "sortOrder"
             FROM "KitGroup"
            WHERE "tenantId" = $1 AND "kitId" = $2
            ORDER BY "sortOrder" ASC, name ASC, id ASC"#,
    )
    .bind(tenant.as_str())
    .bind(kit_id)
    .fetch_all(pool)
    .await?;

    let items = sqlx::query_as::<_, KitItemRow>(
        r#"SELECT ki.id, ki."productId", p.name AS product_name,
                  ki."variationId", v.name AS variation_name, ki."groupId",
                  ki.quantity, ki."minQty", ki."maxQty", ki.step, ki."allowSwap",
                  ki."sortOrder"
             FROM "KitItem" ki
             LEFT JOIN "Product" p ON p.id = ki."productId" AND p."tenantId" = ki."tenantId"
             LEFT JOIN "Variation" v ON v.id = ki."variationId" AND v."tenantId" = ki."tenantId"
            WHERE ki."tenantId" = $1 AND ki."kitId" = $2
            ORDER BY ki."sortOrder" ASC, ki.id ASC"#,
    )
    .bind(tenant.as_str())
    .bind(kit_id)
    .fetch_all(pool)
    .await?;

    let swap_rows = sqlx::query_as::<_, (String, String)>(
        r#"SELECT kit."kitItemId", kit."variationId"
             FROM "KitItemVariation" kit
             JOIN "KitItem" item ON item.id = kit."kitItemId" AND item."tenantId" = kit."tenantId"
            WHERE kit."tenantId" = $1 AND item."kitId" = $2
            ORDER BY kit."variationId" ASC"#,
    )
    .bind(tenant.as_str())
    .bind(kit_id)
    .fetch_all(pool)
    .await?;

    let mut swaps: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();

    for (item_id, variation_id) in swap_rows {
        swaps.entry(item_id).or_default().push(variation_id);
    }

    let bands = sqlx::query_as::<_, KitBandRow>(
        r#"SELECT id, "minQuantity", percent
             FROM "KitDiscountBand"
            WHERE "tenantId" = $1 AND "kitId" = $2
            ORDER BY "minQuantity" ASC"#,
    )
    .bind(tenant.as_str())
    .bind(kit_id)
    .fetch_all(pool)
    .await?;

    Ok(Some(KitDetail {
        kit,
        groups,
        items,
        swaps,
        bands,
    }))
}

/// True when every dish names a variation that belongs to this store and to the
/// product the dish claims, and every alternate variation is one of that
/// product's.
pub async fn kit_references_owned(
    pool: &PgPool,
    tenant: &TenantId,
    write: &KitWrite<'_>,
) -> Result<bool, sqlx::Error> {
    for item in &write.items {
        let found = sqlx::query_scalar!(
            r#"SELECT count(*) AS "count!"
                 FROM "Variation" v
                 JOIN "Product" p ON p.id = v."productId" AND p."tenantId" = v."tenantId"
                WHERE v."tenantId" = $1 AND v.id = $2 AND v."productId" = $3"#,
            tenant.as_str(),
            item.variation_id,
            item.product_id,
        )
        .fetch_one(pool)
        .await?;

        if found == 0 {
            return Ok(false);
        }

        for variation_id in item.swap_variation_ids {
            let found = sqlx::query_scalar!(
                r#"SELECT count(*) AS "count!"
                     FROM "Variation"
                    WHERE "tenantId" = $1 AND id = $2 AND "productId" = $3"#,
                tenant.as_str(),
                variation_id,
                item.product_id,
            )
            .fetch_one(pool)
            .await?;

            if found == 0 {
                return Ok(false);
            }
        }
    }

    Ok(true)
}

/// Inserts the kit with its groups, dishes, alternate variations and bands.
pub async fn kit_create(
    pool: &PgPool,
    tenant: &TenantId,
    kit_id: &str,
    write: &KitWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    insert_row(&mut tx, tenant, kit_id, write, now).await?;
    insert_children(&mut tx, tenant, kit_id, write).await?;

    tx.commit().await
}

/// Replaces the kit and its whole child set. `false` when the id is not this
/// store's.
pub async fn kit_update(
    pool: &PgPool,
    tenant: &TenantId,
    kit_id: &str,
    write: &KitWrite<'_>,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    {
        let tx: &mut sqlx::PgConnection = &mut tx;

        let updated = sqlx::query!(
            r#"UPDATE "Kit"
              SET name = $3, slug = $4, description = $5, "imageUrl" = $6,
                  kind = $7, "pricingMode" = $8, "baseCents" = $9,
                  "percentOff" = $10, "minItems" = $11, "maxItems" = $12,
                  "maxKitsPerOrder" = $13, "unavailableBehavior" = $14,
                  "couponStackable" = $15, "sortOrder" = $16, available = $17,
                  archived = $18, "updatedAt" = $19
            WHERE "tenantId" = $1 AND id = $2"#,
            tenant.as_str(),
            kit_id,
            write.name,
            write.slug,
            write.description,
            write.image_url,
            write.kind,
            write.pricing_mode,
            write.base_cents,
            write.percent_off,
            write.min_items,
            write.max_items,
            write.max_kits_per_order,
            write.unavailable_behavior,
            write.coupon_stackable,
            write.sort_order,
            write.available,
            write.archived,
            now,
        )
        .execute(&mut *tx)
        .await?;

        if updated.rows_affected() == 0 {
            return Ok(false);
        }

        // Dishes first: a group delete cascades into them.
        sqlx::query!(
            r#"DELETE FROM "KitItem" WHERE "tenantId" = $1 AND "kitId" = $2"#,
            tenant.as_str(),
            kit_id,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query!(
            r#"DELETE FROM "KitGroup" WHERE "tenantId" = $1 AND "kitId" = $2"#,
            tenant.as_str(),
            kit_id,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query!(
            r#"DELETE FROM "KitDiscountBand" WHERE "tenantId" = $1 AND "kitId" = $2"#,
            tenant.as_str(),
            kit_id,
        )
        .execute(&mut *tx)
        .await?;

        insert_children(&mut *tx, tenant, kit_id, write).await?;
    }

    tx.commit().await?;

    Ok(true)
}

/// Archives the kit. `false` when the id is not this store's.
pub async fn kit_archive(
    pool: &PgPool,
    tenant: &TenantId,
    kit_id: &str,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        r#"UPDATE "Kit"
              SET archived = true, available = false, "updatedAt" = $3
            WHERE "tenantId" = $1 AND id = $2"#,
        tenant.as_str(),
        kit_id,
        now,
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

async fn insert_row(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    kit_id: &str,
    write: &KitWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO "Kit"
               (id, "tenantId", name, slug, description, "imageUrl", kind,
                "pricingMode", "baseCents", "percentOff", "minItems", "maxItems",
                "maxKitsPerOrder", "unavailableBehavior", "couponStackable",
                "sortOrder", available, archived, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   $14, $15, $16, $17, $18, $19)"#,
        kit_id,
        tenant.as_str(),
        write.name,
        write.slug,
        write.description,
        write.image_url,
        write.kind,
        write.pricing_mode,
        write.base_cents,
        write.percent_off,
        write.min_items,
        write.max_items,
        write.max_kits_per_order,
        write.unavailable_behavior,
        write.coupon_stackable,
        write.sort_order,
        write.available,
        write.archived,
        now,
    )
    .execute(&mut *tx)
    .await?;

    Ok(())
}

async fn insert_children(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    kit_id: &str,
    write: &KitWrite<'_>,
) -> Result<(), sqlx::Error> {
    let mut group_ids: std::collections::HashMap<&str, String> = std::collections::HashMap::new();

    for group in &write.groups {
        let id = uuid::Uuid::new_v4().to_string();

        sqlx::query!(
            r#"INSERT INTO "KitGroup"
                   (id, "kitId", "tenantId", name, "minItems", "maxItems", "sortOrder")
               VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
            id,
            kit_id,
            tenant.as_str(),
            group.name,
            group.min_items,
            group.max_items,
            group.sort_order,
        )
        .execute(&mut *tx)
        .await?;

        group_ids.insert(group.client_id, id);
    }

    for item in &write.items {
        let id = uuid::Uuid::new_v4().to_string();
        let group_id = item
            .group_client_id
            .and_then(|client_id| group_ids.get(client_id).cloned());

        sqlx::query!(
            r#"INSERT INTO "KitItem"
                   (id, "kitId", "tenantId", "variationId", "productId",
                    "groupId", quantity, "minQty", "maxQty", step, "allowSwap",
                    "sortOrder")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)"#,
            id,
            kit_id,
            tenant.as_str(),
            item.variation_id,
            item.product_id,
            group_id,
            item.quantity,
            item.min_qty,
            item.max_qty,
            item.step,
            item.allow_swap,
            item.sort_order,
        )
        .execute(&mut *tx)
        .await?;

        for variation_id in item.swap_variation_ids {
            sqlx::query!(
                r#"INSERT INTO "KitItemVariation"
                       (id, "kitItemId", "tenantId", "variationId")
                   VALUES ($1, $2, $3, $4)"#,
                uuid::Uuid::new_v4().to_string(),
                id,
                tenant.as_str(),
                variation_id,
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    for band in &write.bands {
        sqlx::query!(
            r#"INSERT INTO "KitDiscountBand"
                   (id, "kitId", "tenantId", "minQuantity", percent)
               VALUES ($1, $2, $3, $4, $5)"#,
            uuid::Uuid::new_v4().to_string(),
            kit_id,
            tenant.as_str(),
            band.min_quantity,
            band.percent,
        )
        .execute(&mut *tx)
        .await?;
    }

    Ok(())
}

/// One product the kit editor can add, with the variations it can point at.
pub struct KitOptionRow {
    pub product_id: String,
    pub product_name: String,
    pub product_available: bool,
    pub product_image_url: Option<String>,
    pub category_name: Option<String>,
    pub variation_id: String,
    pub variation_name: String,
    pub price_cents: i32,
}

/// Every product of the store with its variations, ordered for a picker.
pub async fn kit_options(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<KitOptionRow>, sqlx::Error> {
    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            bool,
            Option<String>,
            Option<String>,
            String,
            String,
            i32,
        ),
    >(
        r#"SELECT p.id, p.name, p.available, p."imageUrl", c.name AS category_name,
                  v.id, v.name, v."priceCents"
             FROM "Product" p
             LEFT JOIN "Subcategory" s ON s.id = p."subcategoryId" AND s."tenantId" = p."tenantId"
             LEFT JOIN "Category" c ON c.id = s."categoryId" AND c."tenantId" = p."tenantId"
             JOIN "Variation" v
               ON v."productId" = p.id AND v."tenantId" = p."tenantId"
            WHERE p."tenantId" = $1 AND p.archived = false
            ORDER BY COALESCE(c.name, 'Geral') ASC, p.name ASC, p.id ASC, v.name ASC, v.id ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| KitOptionRow {
            product_id: row.0,
            product_name: row.1,
            product_available: row.2,
            product_image_url: row.3,
            category_name: row.4,
            variation_id: row.5,
            variation_name: row.6,
            price_cents: row.7,
        })
        .collect())
}
