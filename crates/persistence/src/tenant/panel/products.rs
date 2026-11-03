//! products resource queries, ported from the Bun panel handlers.
//!
//! Money and stock live on `Variation`, so the product row alone never answers
//! a list: the reads join the variations, the tag and badge links and the
//! category chain. Every write opens a scoped transaction, checks that each
//! referenced subcategory, tag and badge is the store's, and rolls back whole
//! when one is not.
//!
//! Deleting or removing a variation a kit or an order still points at is
//! refused rather than cascaded; the bulk delete reports the protected rows
//! instead of failing the selection.

use std::collections::HashSet;

use chrono::NaiveDateTime;
use sqlx::{PgConnection, PgPool};

use crate::tenant::{TenantId, begin_scoped};

/// One product row as every read sees it.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ProductRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub available: bool,
    pub archived: bool,
    pub hidden: bool,
    pub private: bool,
    #[sqlx(rename = "sortOrder")]
    pub sort_order: i32,
    #[sqlx(rename = "subcategoryId")]
    pub subcategory_id: Option<String>,
    #[sqlx(rename = "updatedAt")]
    pub updated_at: NaiveDateTime,
}

/// One variation, with the product it belongs to.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct VariationRow {
    pub id: String,
    #[sqlx(rename = "productId")]
    pub product_id: String,
    pub name: String,
    #[sqlx(rename = "priceCents")]
    pub price_cents: i32,
    #[sqlx(rename = "stockMode")]
    pub stock_mode: String,
    #[sqlx(rename = "stockQty")]
    pub stock_qty: Option<i32>,
}

/// One product → tag link, joined to the tag.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ProductTagRow {
    #[sqlx(rename = "productId")]
    pub product_id: String,
    pub tag_id: String,
    pub tag_name: String,
}

/// One product → badge link, joined to the badge.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ProductBadgeRow {
    #[sqlx(rename = "productId")]
    pub product_id: String,
    pub badge_id: String,
    pub badge_name: String,
    pub image_url: String,
}

/// A subcategory with its category, for the list's grouping.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SubcategoryLink {
    pub subcategory_id: String,
    pub subcategory_name: String,
    pub category_id: String,
    pub category_name: String,
}

/// One category → department link, joined to the department name.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DepartmentLink {
    pub category_id: String,
    pub department_id: String,
    pub department_name: String,
}

/// A product's SEO override, when it has one.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ProductSeoRow {
    pub entity_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
}

/// The 1:1 nutrition label row.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct NutritionRow {
    pub basis: String,
    #[sqlx(rename = "labelFormat")]
    pub label_format: String,
    pub source: String,
    #[sqlx(rename = "referenceAt")]
    pub reference_at: Option<NaiveDateTime>,
    #[sqlx(rename = "energyKcal")]
    pub energy_kcal: Option<i32>,
    #[sqlx(rename = "carbsMg")]
    pub carbs_mg: Option<i32>,
    #[sqlx(rename = "totalSugarsMg")]
    pub total_sugars_mg: Option<i32>,
    #[sqlx(rename = "addedSugarsMg")]
    pub added_sugars_mg: Option<i32>,
    #[sqlx(rename = "proteinMg")]
    pub protein_mg: Option<i32>,
    #[sqlx(rename = "totalFatMg")]
    pub total_fat_mg: Option<i32>,
    #[sqlx(rename = "saturatedFatMg")]
    pub saturated_fat_mg: Option<i32>,
    #[sqlx(rename = "transFatMg")]
    pub trans_fat_mg: Option<i32>,
    #[sqlx(rename = "fiberMg")]
    pub fiber_mg: Option<i32>,
    #[sqlx(rename = "sodiumMg")]
    pub sodium_mg: Option<i32>,
    #[sqlx(rename = "portionMilli")]
    pub portion_milli: Option<i32>,
    #[sqlx(rename = "householdMeasure")]
    pub household_measure: Option<String>,
    #[sqlx(rename = "servingsPerPack")]
    pub servings_per_pack: Option<i32>,
    #[sqlx(rename = "showHighAddedSugar")]
    pub show_high_added_sugar: bool,
    #[sqlx(rename = "showHighSatFat")]
    pub show_high_sat_fat: bool,
    #[sqlx(rename = "showHighSodium")]
    pub show_high_sodium: bool,
    pub published: bool,
    pub notes: Option<String>,
    #[sqlx(rename = "updatedAt")]
    pub updated_at: NaiveDateTime,
}

/// Everything the detail response renders, in one value.
pub struct ProductDetailRow {
    pub product: ProductRow,
    pub subcategory: Option<SubcategoryLink>,
    pub departments: Vec<DepartmentLink>,
    pub tags: Vec<ProductTagRow>,
    pub badges: Vec<ProductBadgeRow>,
    pub variations: Vec<VariationRow>,
    pub nutrition: Option<NutritionRow>,
}

/// The fields every product write carries; the handler merges a partial
/// payload onto the stored row before calling.
pub struct ProductWrite<'a> {
    pub name: &'a str,
    pub description: Option<&'a str>,
    pub subcategory_id: Option<&'a str>,
    pub available: bool,
    pub archived: bool,
    pub hidden: bool,
    pub private: bool,
    pub sort_order: i32,
}

/// One variation to insert or update. An `id` present updates the row.
pub struct VariationWrite<'a> {
    pub id: Option<&'a str>,
    pub name: &'a str,
    pub price_cents: i32,
    pub stock_mode: &'a str,
    pub stock_qty: Option<i32>,
}

/// The full nutrition row the handler already merged and validated.
pub struct NutritionWrite<'a> {
    pub basis: &'a str,
    pub label_format: &'a str,
    pub source: &'a str,
    pub reference_at: Option<NaiveDateTime>,
    pub energy_kcal: Option<i32>,
    pub carbs_mg: Option<i32>,
    pub total_sugars_mg: Option<i32>,
    pub added_sugars_mg: Option<i32>,
    pub protein_mg: Option<i32>,
    pub total_fat_mg: Option<i32>,
    pub saturated_fat_mg: Option<i32>,
    pub trans_fat_mg: Option<i32>,
    pub fiber_mg: Option<i32>,
    pub sodium_mg: Option<i32>,
    pub portion_milli: Option<i32>,
    pub household_measure: Option<&'a str>,
    pub servings_per_pack: Option<i32>,
    pub show_high_added_sugar: bool,
    pub show_high_sat_fat: bool,
    pub show_high_sodium: bool,
    pub published: bool,
    pub notes: Option<&'a str>,
}

/// A product the bulk delete left alone.
pub struct SkippedProduct {
    pub id: String,
    pub name: String,
}

/// The bulk delete result: how many rows went, and which stayed.
pub struct BulkDeleteResult {
    pub deleted: i64,
    pub skipped: Vec<SkippedProduct>,
}

/// What a create or an update did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProductWriteOutcome {
    /// The row and its links were written.
    Updated,
    /// A referenced subcategory, tag or badge is not the store's.
    MissingReference,
    /// A removed variation is still named by a kit or an order.
    VariationInUse,
}

/// What a delete did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProductDeleteOutcome {
    Deleted,
    Missing,
    InUse,
}

/// What a bulk update did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProductBulkOutcome {
    Updated,
    /// A selected product, a tag or the subcategory is not the store's.
    MissingReference,
}

/// The sort keys the list accepts.
pub struct ProductFilter<'a> {
    pub sort_by: &'a str,
    pub order: &'a str,
}

/// The store's products in the requested base order.
pub async fn product_list(
    pool: &PgPool,
    tenant: &TenantId,
    filter: &ProductFilter<'_>,
) -> Result<Vec<ProductRow>, sqlx::Error> {
    let sql = format!(
        r#"SELECT p.id, p.name, p.description, p.available, p.archived, p.hidden,
                  p.private, p."sortOrder", p."subcategoryId", p."updatedAt"
             FROM "Product" p
            WHERE p."tenantId" = $1
            ORDER BY {}"#,
        order_clause(filter.sort_by, filter.order)
    );

    sqlx::query_as::<_, ProductRow>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .fetch_all(pool)
        .await
}

/// Every variation of the store, in name order.
pub async fn product_variations(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<VariationRow>, sqlx::Error> {
    sqlx::query_as::<_, VariationRow>(
        r#"SELECT id, "productId", name, "priceCents", "stockMode", "stockQty"
             FROM "Variation"
            WHERE "tenantId" = $1
            ORDER BY name ASC, id ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}

/// Every product → tag link of the store, in tag name order.
pub async fn product_tags(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<ProductTagRow>, sqlx::Error> {
    sqlx::query_as::<_, ProductTagRow>(
        r#"SELECT pt."productId", t.id AS tag_id, t.name AS tag_name
             FROM "ProductTag" pt
             JOIN "Tag" t ON t.id = pt."tagId" AND t."tenantId" = pt."tenantId"
            WHERE pt."tenantId" = $1
            ORDER BY t.name ASC, t.id ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}

/// Every product → badge link of the store, in badge name order.
pub async fn product_badges(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<ProductBadgeRow>, sqlx::Error> {
    sqlx::query_as::<_, ProductBadgeRow>(
        r#"SELECT pb."productId", b.id AS badge_id, b.name AS badge_name, b."imageUrl"
             FROM "ProductBadge" pb
             JOIN "Badge" b ON b.id = pb."badgeId" AND b."tenantId" = pb."tenantId"
            WHERE pb."tenantId" = $1
            ORDER BY b.name ASC, b.id ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}

/// Every subcategory of the store with its category.
pub async fn product_subcategories(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<SubcategoryLink>, sqlx::Error> {
    sqlx::query_as::<_, SubcategoryLink>(
        r#"SELECT s.id AS subcategory_id, s.name AS subcategory_name,
                  c.id AS category_id, c.name AS category_name
             FROM "Subcategory" s
             JOIN "Category" c ON c.id = s."categoryId" AND c."tenantId" = s."tenantId"
            WHERE s."tenantId" = $1"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}

/// Every category → department link of the store, in department name order.
pub async fn product_departments(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<DepartmentLink>, sqlx::Error> {
    sqlx::query_as::<_, DepartmentLink>(
        r#"SELECT cd."categoryId" AS category_id, cd."departmentId" AS department_id, d.name AS department_name
             FROM "CategoryDepartment" cd
             JOIN "Department" d ON d.id = cd."departmentId" AND d."tenantId" = cd."tenantId"
            WHERE cd."tenantId" = $1
            ORDER BY d.name ASC, cd."departmentId" ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}

/// Every product SEO override of the store.
pub async fn product_seo(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<ProductSeoRow>, sqlx::Error> {
    sqlx::query_as::<_, ProductSeoRow>(
        r#"SELECT "entityId" AS entity_id, title, description
             FROM "SeoMeta"
            WHERE "tenantId" = $1 AND "entityType" = 'product'"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}

/// One product with its category chain, links, variations and label, or
/// `None` when the id is not this store's.
pub async fn product_detail(
    pool: &PgPool,
    tenant: &TenantId,
    product_id: &str,
) -> Result<Option<ProductDetailRow>, sqlx::Error> {
    let Some(product) = product_row(pool, tenant, product_id).await? else {
        return Ok(None);
    };

    let subcategory = match &product.subcategory_id {
        Some(id) => subcategory_of(pool, tenant, id).await?,
        None => None,
    };

    let departments = match &subcategory {
        Some(link) => departments_of(pool, tenant, &link.category_id).await?,
        None => Vec::new(),
    };

    let tags = sqlx::query_as::<_, ProductTagRow>(
        r#"SELECT pt."productId", t.id AS tag_id, t.name AS tag_name
             FROM "ProductTag" pt
             JOIN "Tag" t ON t.id = pt."tagId" AND t."tenantId" = pt."tenantId"
            WHERE pt."tenantId" = $1 AND pt."productId" = $2
            ORDER BY t.name ASC, t.id ASC"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_all(pool)
    .await?;

    let badges = sqlx::query_as::<_, ProductBadgeRow>(
        r#"SELECT pb."productId", b.id AS badge_id, b.name AS badge_name, b."imageUrl"
             FROM "ProductBadge" pb
             JOIN "Badge" b ON b.id = pb."badgeId" AND b."tenantId" = pb."tenantId"
            WHERE pb."tenantId" = $1 AND pb."productId" = $2
            ORDER BY b.name ASC, b.id ASC"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_all(pool)
    .await?;

    let variations = sqlx::query_as::<_, VariationRow>(
        r#"SELECT id, "productId", name, "priceCents", "stockMode", "stockQty"
             FROM "Variation"
            WHERE "tenantId" = $1 AND "productId" = $2
            ORDER BY name ASC, id ASC"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_all(pool)
    .await?;

    let nutrition = product_nutrition(pool, tenant, product_id).await?;

    Ok(Some(ProductDetailRow {
        product,
        subcategory,
        departments,
        tags,
        badges,
        variations,
        nutrition,
    }))
}

/// The product row alone, or `None` when the id is not this store's.
pub async fn product_row(
    pool: &PgPool,
    tenant: &TenantId,
    product_id: &str,
) -> Result<Option<ProductRow>, sqlx::Error> {
    sqlx::query_as::<_, ProductRow>(
        r#"SELECT id, name, description, available, archived, hidden, private,
                  "sortOrder", "subcategoryId", "updatedAt"
             FROM "Product"
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_optional(pool)
    .await
}

/// The product's nutrition row, or `None` when it has no label yet.
pub async fn product_nutrition(
    pool: &PgPool,
    tenant: &TenantId,
    product_id: &str,
) -> Result<Option<NutritionRow>, sqlx::Error> {
    sqlx::query_as::<_, NutritionRow>(
        r#"SELECT basis, "labelFormat", source, "referenceAt", "energyKcal",
                  "carbsMg", "totalSugarsMg", "addedSugarsMg", "proteinMg",
                  "totalFatMg", "saturatedFatMg", "transFatMg", "fiberMg",
                  "sodiumMg", "portionMilli", "householdMeasure",
                  "servingsPerPack", "showHighAddedSugar", "showHighSatFat",
                  "showHighSodium", published, notes, "updatedAt"
             FROM "ProductNutrition"
            WHERE "tenantId" = $1 AND "productId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_optional(pool)
    .await
}

/// Inserts the product, its variations and its tag and badge links.
#[allow(clippy::too_many_arguments)]
pub async fn product_create(
    pool: &PgPool,
    tenant: &TenantId,
    product_id: &str,
    write: &ProductWrite<'_>,
    variations: &[VariationWrite<'_>],
    tag_ids: &[String],
    badge_ids: &[String],
    now: NaiveDateTime,
) -> Result<ProductWriteOutcome, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    if !references_owned(&mut tx, tenant, write.subcategory_id, tag_ids, badge_ids).await? {
        return Ok(ProductWriteOutcome::MissingReference);
    }

    sqlx::query(
        r#"INSERT INTO "Product"
               (id, "tenantId", name, description, "subcategoryId", available,
                archived, hidden, private, "sortOrder", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"#,
    )
    .bind(product_id)
    .bind(tenant.as_str())
    .bind(write.name)
    .bind(write.description)
    .bind(write.subcategory_id)
    .bind(write.available)
    .bind(write.archived)
    .bind(write.hidden)
    .bind(write.private)
    .bind(write.sort_order)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    for variation in variations {
        insert_variation(&mut tx, tenant, product_id, variation).await?;
    }

    for tag_id in tag_ids.iter().collect::<HashSet<_>>() {
        sqlx::query(
            r#"INSERT INTO "ProductTag" ("tenantId", "productId", "tagId")
               VALUES ($1, $2, $3)"#,
        )
        .bind(tenant.as_str())
        .bind(product_id)
        .bind(tag_id.as_str())
        .execute(&mut **tx)
        .await?;
    }

    for badge_id in badge_ids.iter().collect::<HashSet<_>>() {
        sqlx::query(
            r#"INSERT INTO "ProductBadge" ("tenantId", "productId", "badgeId")
               VALUES ($1, $2, $3)"#,
        )
        .bind(tenant.as_str())
        .bind(product_id)
        .bind(badge_id.as_str())
        .execute(&mut **tx)
        .await?;
    }

    tx.commit().await?;

    Ok(ProductWriteOutcome::Updated)
}

/// Rewrites the product and, when present, replaces its variation set and its
/// tag and badge links. A removed variation still named by a kit or an order
/// is a `VariationInUse` and nothing lands.
#[allow(clippy::too_many_arguments)]
pub async fn product_update(
    pool: &PgPool,
    tenant: &TenantId,
    product_id: &str,
    write: &ProductWrite<'_>,
    variations: Option<&[VariationWrite<'_>]>,
    removed_ids: &[String],
    tag_ids: Option<&[String]>,
    badge_ids: Option<&[String]>,
    now: NaiveDateTime,
) -> Result<ProductWriteOutcome, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    if !references_owned(
        &mut tx,
        tenant,
        write.subcategory_id,
        tag_ids.unwrap_or(&[]),
        badge_ids.unwrap_or(&[]),
    )
    .await?
    {
        return Ok(ProductWriteOutcome::MissingReference);
    }

    if variations.is_some() {
        for variation_id in removed_ids {
            if variation_in_use(&mut tx, tenant, variation_id).await? {
                return Ok(ProductWriteOutcome::VariationInUse);
            }
        }
    }

    sqlx::query(
        r#"UPDATE "Product"
              SET name = $3, description = $4, "subcategoryId" = $5,
                  available = $6, archived = $7, hidden = $8, private = $9,
                  "sortOrder" = $10, "updatedAt" = $11
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .bind(write.name)
    .bind(write.description)
    .bind(write.subcategory_id)
    .bind(write.available)
    .bind(write.archived)
    .bind(write.hidden)
    .bind(write.private)
    .bind(write.sort_order)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    if let Some(variations) = variations {
        for variation in variations {
            match variation.id {
                Some(id) => {
                    sqlx::query(
                        r#"UPDATE "Variation"
                              SET name = $4, "priceCents" = $5, "stockMode" = $6,
                                  "stockQty" = $7
                            WHERE "tenantId" = $1 AND id = $2 AND "productId" = $3"#,
                    )
                    .bind(tenant.as_str())
                    .bind(id)
                    .bind(product_id)
                    .bind(variation.name)
                    .bind(variation.price_cents)
                    .bind(variation.stock_mode)
                    .bind(variation.stock_qty)
                    .execute(&mut **tx)
                    .await?;
                }
                None => insert_variation(&mut tx, tenant, product_id, variation).await?,
            }
        }

        for variation_id in removed_ids {
            sqlx::query(
                r#"DELETE FROM "Variation"
                    WHERE "tenantId" = $1 AND id = $2 AND "productId" = $3"#,
            )
            .bind(tenant.as_str())
            .bind(variation_id)
            .bind(product_id)
            .execute(&mut **tx)
            .await?;
        }
    }

    if let Some(tag_ids) = tag_ids {
        replace_tags(&mut tx, tenant, product_id, tag_ids).await?;
    }

    if let Some(badge_ids) = badge_ids {
        replace_badges(&mut tx, tenant, product_id, badge_ids).await?;
    }

    tx.commit().await?;

    Ok(ProductWriteOutcome::Updated)
}

/// Deletes the product unless an order line or a kit names it or one of its
/// variations.
pub async fn product_delete(
    pool: &PgPool,
    tenant: &TenantId,
    product_id: &str,
) -> Result<ProductDeleteOutcome, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    if !product_row_exists(&mut tx, tenant, product_id).await? {
        return Ok(ProductDeleteOutcome::Missing);
    }

    if product_in_use(&mut tx, tenant, product_id).await? {
        return Ok(ProductDeleteOutcome::InUse);
    }

    sqlx::query(r#"DELETE FROM "Product" WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(product_id)
        .execute(&mut **tx)
        .await?;

    tx.commit().await?;

    Ok(ProductDeleteOutcome::Deleted)
}

/// Applies one patch to the whole selection. A single id that is not the
/// store's, or a tag or subcategory from another store, rolls the batch back.
#[allow(clippy::too_many_arguments)]
pub async fn product_bulk_update(
    pool: &PgPool,
    tenant: &TenantId,
    product_ids: &[String],
    available: Option<bool>,
    subcategory_id: Option<Option<&str>>,
    add_tag_ids: Option<&[String]>,
    now: NaiveDateTime,
) -> Result<ProductBulkOutcome, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let owned = sqlx::query_scalar::<_, i64>(
        r#"SELECT count(*) FROM "Product" WHERE "tenantId" = $1 AND id = ANY($2)"#,
    )
    .bind(tenant.as_str())
    .bind(product_ids)
    .fetch_one(&mut **tx)
    .await?;

    if owned as usize != product_ids.len() {
        return Ok(ProductBulkOutcome::MissingReference);
    }

    let tag_ids = add_tag_ids.unwrap_or(&[]);
    let subcategory = subcategory_id.flatten();

    if !references_owned(&mut tx, tenant, subcategory, tag_ids, &[]).await? {
        return Ok(ProductBulkOutcome::MissingReference);
    }

    sqlx::query(
        r#"UPDATE "Product"
              SET available = CASE WHEN $3 THEN $4 ELSE available END,
                  "subcategoryId" = CASE WHEN $5 THEN $6 ELSE "subcategoryId" END,
                  "updatedAt" = $7
            WHERE "tenantId" = $1 AND id = ANY($2)"#,
    )
    .bind(tenant.as_str())
    .bind(product_ids)
    .bind(available.is_some())
    .bind(available.unwrap_or(false))
    .bind(subcategory_id.is_some())
    .bind(subcategory)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    if !tag_ids.is_empty() {
        merge_tags(&mut tx, tenant, product_ids, tag_ids).await?;
    }

    tx.commit().await?;

    Ok(ProductBulkOutcome::Updated)
}

/// Deletes the deletable part of the selection and reports the protected rows.
pub async fn product_bulk_delete(
    pool: &PgPool,
    tenant: &TenantId,
    product_ids: &[String],
) -> Result<BulkDeleteResult, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let products = sqlx::query_as::<_, (String, String)>(
        r#"SELECT id, name FROM "Product" WHERE "tenantId" = $1 AND id = ANY($2)"#,
    )
    .bind(tenant.as_str())
    .bind(product_ids)
    .fetch_all(&mut **tx)
    .await?;

    let mut skipped = Vec::new();
    let mut deletable = Vec::new();

    for (id, name) in products {
        if product_in_use(&mut tx, tenant, &id).await? {
            skipped.push(SkippedProduct { id, name });
            continue;
        }

        deletable.push(id);
    }

    for id in &deletable {
        sqlx::query(r#"DELETE FROM "Product" WHERE "tenantId" = $1 AND id = $2"#)
            .bind(tenant.as_str())
            .bind(id)
            .execute(&mut **tx)
            .await?;
    }

    tx.commit().await?;

    Ok(BulkDeleteResult {
        deleted: deletable.len() as i64,
        skipped,
    })
}

/// Upserts the product's label, creating it with the merged values on first
/// save.
pub async fn product_nutrition_save(
    pool: &PgPool,
    tenant: &TenantId,
    product_id: &str,
    nutrition_id: &str,
    write: &NutritionWrite<'_>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let updated = sqlx::query(
        r#"UPDATE "ProductNutrition"
              SET basis = $3, "labelFormat" = $4, source = $5, "referenceAt" = $6,
                  "energyKcal" = $7, "carbsMg" = $8, "totalSugarsMg" = $9,
                  "addedSugarsMg" = $10, "proteinMg" = $11, "totalFatMg" = $12,
                  "saturatedFatMg" = $13, "transFatMg" = $14, "fiberMg" = $15,
                  "sodiumMg" = $16, "portionMilli" = $17, "householdMeasure" = $18,
                  "servingsPerPack" = $19, "showHighAddedSugar" = $20,
                  "showHighSatFat" = $21, "showHighSodium" = $22,
                  published = $23, notes = $24, "updatedAt" = $25
            WHERE "tenantId" = $1 AND "productId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .bind(write.basis)
    .bind(write.label_format)
    .bind(write.source)
    .bind(write.reference_at)
    .bind(write.energy_kcal)
    .bind(write.carbs_mg)
    .bind(write.total_sugars_mg)
    .bind(write.added_sugars_mg)
    .bind(write.protein_mg)
    .bind(write.total_fat_mg)
    .bind(write.saturated_fat_mg)
    .bind(write.trans_fat_mg)
    .bind(write.fiber_mg)
    .bind(write.sodium_mg)
    .bind(write.portion_milli)
    .bind(write.household_measure)
    .bind(write.servings_per_pack)
    .bind(write.show_high_added_sugar)
    .bind(write.show_high_sat_fat)
    .bind(write.show_high_sodium)
    .bind(write.published)
    .bind(write.notes)
    .bind(now)
    .execute(&mut **tx)
    .await?;

    if updated.rows_affected() == 0 {
        sqlx::query(
            r#"INSERT INTO "ProductNutrition"
                   (id, "tenantId", "productId", basis, "labelFormat", source,
                    "referenceAt", "energyKcal", "carbsMg", "totalSugarsMg",
                    "addedSugarsMg", "proteinMg", "totalFatMg", "saturatedFatMg",
                    "transFatMg", "fiberMg", "sodiumMg", "portionMilli",
                    "householdMeasure", "servingsPerPack", "showHighAddedSugar",
                    "showHighSatFat", "showHighSodium", published, notes, "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                       $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)"#,
        )
        .bind(nutrition_id)
        .bind(tenant.as_str())
        .bind(product_id)
        .bind(write.basis)
        .bind(write.label_format)
        .bind(write.source)
        .bind(write.reference_at)
        .bind(write.energy_kcal)
        .bind(write.carbs_mg)
        .bind(write.total_sugars_mg)
        .bind(write.added_sugars_mg)
        .bind(write.protein_mg)
        .bind(write.total_fat_mg)
        .bind(write.saturated_fat_mg)
        .bind(write.trans_fat_mg)
        .bind(write.fiber_mg)
        .bind(write.sodium_mg)
        .bind(write.portion_milli)
        .bind(write.household_measure)
        .bind(write.servings_per_pack)
        .bind(write.show_high_added_sugar)
        .bind(write.show_high_sat_fat)
        .bind(write.show_high_sodium)
        .bind(write.published)
        .bind(write.notes)
        .bind(now)
        .execute(&mut **tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

/// One variation insert; `productId` always comes from the caller's row.
async fn insert_variation(
    conn: &mut PgConnection,
    tenant: &TenantId,
    product_id: &str,
    variation: &VariationWrite<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "Variation"
               (id, "tenantId", "productId", name, "priceCents", "stockMode", "stockQty")
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(product_id)
    .bind(variation.name)
    .bind(variation.price_cents)
    .bind(variation.stock_mode)
    .bind(variation.stock_qty)
    .execute(&mut *conn)
    .await?;

    Ok(())
}

/// Replaces the product's whole tag set.
async fn replace_tags(
    conn: &mut PgConnection,
    tenant: &TenantId,
    product_id: &str,
    tag_ids: &[String],
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"DELETE FROM "ProductTag" WHERE "tenantId" = $1 AND "productId" = $2"#)
        .bind(tenant.as_str())
        .bind(product_id)
        .execute(&mut *conn)
        .await?;

    for tag_id in tag_ids.iter().collect::<HashSet<_>>() {
        sqlx::query(
            r#"INSERT INTO "ProductTag" ("tenantId", "productId", "tagId")
               VALUES ($1, $2, $3)"#,
        )
        .bind(tenant.as_str())
        .bind(product_id)
        .bind(tag_id.as_str())
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}

/// Replaces the product's whole badge set.
async fn replace_badges(
    conn: &mut PgConnection,
    tenant: &TenantId,
    product_id: &str,
    badge_ids: &[String],
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"DELETE FROM "ProductBadge" WHERE "tenantId" = $1 AND "productId" = $2"#)
        .bind(tenant.as_str())
        .bind(product_id)
        .execute(&mut *conn)
        .await?;

    for badge_id in badge_ids.iter().collect::<HashSet<_>>() {
        sqlx::query(
            r#"INSERT INTO "ProductBadge" ("tenantId", "productId", "badgeId")
               VALUES ($1, $2, $3)"#,
        )
        .bind(tenant.as_str())
        .bind(product_id)
        .bind(badge_id.as_str())
        .execute(&mut *conn)
        .await?;
    }

    Ok(())
}

/// Adds the missing product → tag pairs, leaving the existing ones alone.
async fn merge_tags(
    conn: &mut PgConnection,
    tenant: &TenantId,
    product_ids: &[String],
    tag_ids: &[String],
) -> Result<(), sqlx::Error> {
    let existing = sqlx::query_as::<_, (String, String)>(
        r#"SELECT "productId", "tagId"
             FROM "ProductTag"
            WHERE "tenantId" = $1 AND "productId" = ANY($2)"#,
    )
    .bind(tenant.as_str())
    .bind(product_ids)
    .fetch_all(&mut *conn)
    .await?;

    let present: HashSet<(String, String)> = existing.into_iter().collect();

    for product_id in product_ids {
        for tag_id in tag_ids.iter().collect::<HashSet<_>>() {
            if !present.contains(&(product_id.clone(), tag_id.to_string())) {
                sqlx::query(
                    r#"INSERT INTO "ProductTag" ("tenantId", "productId", "tagId")
                       VALUES ($1, $2, $3)"#,
                )
                .bind(tenant.as_str())
                .bind(product_id)
                .bind(tag_id.as_str())
                .execute(&mut *conn)
                .await?;
            }
        }
    }

    Ok(())
}

/// Whether a subcategory, tag or badge is not the store's.
async fn references_owned(
    conn: &mut PgConnection,
    tenant: &TenantId,
    subcategory_id: Option<&str>,
    tag_ids: &[String],
    badge_ids: &[String],
) -> Result<bool, sqlx::Error> {
    if let Some(id) = subcategory_id
        && !row_exists(conn, tenant, "Subcategory", id).await?
    {
        return Ok(false);
    }

    for tag_id in tag_ids.iter().collect::<HashSet<_>>() {
        if !row_exists(conn, tenant, "Tag", tag_id.as_str()).await? {
            return Ok(false);
        }
    }

    for badge_id in badge_ids.iter().collect::<HashSet<_>>() {
        if !row_exists(conn, tenant, "Badge", badge_id.as_str()).await? {
            return Ok(false);
        }
    }

    Ok(true)
}

/// Existence inside the tenant. The table name is a literal from the callers
/// above, never caller text.
async fn row_exists(
    conn: &mut PgConnection,
    tenant: &TenantId,
    table: &str,
    id: &str,
) -> Result<bool, sqlx::Error> {
    let sql = format!(r#"SELECT id FROM "{table}" WHERE "tenantId" = $1 AND id = $2"#);

    let row = sqlx::query_as::<_, (String,)>(sqlx::AssertSqlSafe(sql))
        .bind(tenant.as_str())
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;

    Ok(row.is_some())
}

/// Whether an order line names the product.
async fn product_row_exists(
    conn: &mut PgConnection,
    tenant: &TenantId,
    product_id: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Product" WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_optional(&mut *conn)
    .await?;

    Ok(row.is_some())
}

/// Whether an order line or a kit still names the product or any variation.
async fn product_in_use(
    conn: &mut PgConnection,
    tenant: &TenantId,
    product_id: &str,
) -> Result<bool, sqlx::Error> {
    let order_item = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "OrderItem" WHERE "tenantId" = $1 AND "productId" = $2 LIMIT 1"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_optional(&mut *conn)
    .await?;

    if order_item.is_some() {
        return Ok(true);
    }

    let variations = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Variation" WHERE "tenantId" = $1 AND "productId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(product_id)
    .fetch_all(&mut *conn)
    .await?;

    for (variation_id,) in variations {
        if variation_in_use(conn, tenant, &variation_id).await? {
            return Ok(true);
        }
    }

    Ok(false)
}

/// A variation a kit or an order still points at may not be removed.
async fn variation_in_use(
    conn: &mut PgConnection,
    tenant: &TenantId,
    variation_id: &str,
) -> Result<bool, sqlx::Error> {
    let kit_item = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "KitItem" WHERE "tenantId" = $1 AND "variationId" = $2 LIMIT 1"#,
    )
    .bind(tenant.as_str())
    .bind(variation_id)
    .fetch_optional(&mut *conn)
    .await?;

    if kit_item.is_some() {
        return Ok(true);
    }

    let order_item = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "OrderItem" WHERE "tenantId" = $1 AND "variationId" = $2 LIMIT 1"#,
    )
    .bind(tenant.as_str())
    .bind(variation_id)
    .fetch_optional(&mut *conn)
    .await?;

    Ok(order_item.is_some())
}

/// The subcategory with its category name, when it is this store's.
async fn subcategory_of(
    pool: &PgPool,
    tenant: &TenantId,
    subcategory_id: &str,
) -> Result<Option<SubcategoryLink>, sqlx::Error> {
    sqlx::query_as::<_, SubcategoryLink>(
        r#"SELECT s.id AS subcategory_id, s.name AS subcategory_name,
                  c.id AS category_id, c.name AS category_name
             FROM "Subcategory" s
             JOIN "Category" c ON c.id = s."categoryId" AND c."tenantId" = s."tenantId"
            WHERE s."tenantId" = $1 AND s.id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(subcategory_id)
    .fetch_optional(pool)
    .await
}

/// The category's departments, in name order.
async fn departments_of(
    pool: &PgPool,
    tenant: &TenantId,
    category_id: &str,
) -> Result<Vec<DepartmentLink>, sqlx::Error> {
    sqlx::query_as::<_, DepartmentLink>(
        r#"SELECT cd."categoryId" AS category_id, cd."departmentId" AS department_id, d.name AS department_name
             FROM "CategoryDepartment" cd
             JOIN "Department" d ON d.id = cd."departmentId" AND d."tenantId" = cd."tenantId"
            WHERE cd."tenantId" = $1 AND cd."categoryId" = $2
            ORDER BY d.name ASC, cd."departmentId" ASC"#,
    )
    .bind(tenant.as_str())
    .bind(category_id)
    .fetch_all(pool)
    .await
}

/// The `ORDER BY` body: every arm is a literal, never caller text. Price,
/// category and stock are computed from joined rows, so they keep the stable
/// `sortOrder` base and are ordered by the handler after mapping.
fn order_clause(sort_by: &str, order: &str) -> &'static str {
    match (sort_by, order) {
        ("name", "desc") => r#"p.name DESC, p.id ASC"#,
        ("name", _) => r#"p.name ASC, p.id ASC"#,
        ("updatedAt", "desc") => r#"p."updatedAt" DESC, p.id ASC"#,
        ("updatedAt", _) => r#"p."updatedAt" ASC, p.id ASC"#,
        ("price" | "category" | "stock", _) => r#"p."sortOrder" ASC, p.id ASC"#,
        ("sortOrder", "desc") => r#"p."sortOrder" DESC, p.id ASC"#,
        _ => r#"p."sortOrder" ASC, p.id ASC"#,
    }
}
