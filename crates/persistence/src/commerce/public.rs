//! public subdomain queries, ported from the Bun persistence layer.
//!
//! The storefront's four reads (MEN-260). Every statement binds `"tenantId"`, and
//! the sales rules mirror the Bun implementation: archived, hidden and private
//! products never reach the menu, a variation is available by its stock mode, a
//! tag ships only when active, and a badge only when active, ordered by
//! `sortOrder`. `fromPriceCents` is the cheapest variation.

use std::collections::HashMap;

use chrono::{NaiveDateTime, SecondsFormat};
use contract::commerce::public::{
    ChangeFrequency, NutritionBasis, NutritionLabelFormat, NutritionSource, PublicBadge,
    PublicCategory, PublicDepartment, PublicMenu, PublicNutrition, PublicProduct,
    PublicProductDetail, PublicSeo, PublicSitemap, PublicSitemapEntry, PublicStore,
    PublicSubcategory, PublicVariation,
};
use domain::seo::{
    ResolvedSeo, SeoContext, SeoEntityType, SeoInput, SeoMetaRow, StoreSeoDefaults, resolve_seo,
};

use crate::tenant::TenantId;

/// `Timestamp(3)` → RFC 3339 with milliseconds and a trailing `Z`, the shape the
/// Bun backend's `Date.toISOString()` produced.
fn to_iso(timestamp: NaiveDateTime) -> String {
    timestamp
        .and_utc()
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// `Store` with no resolved tenant: empty fields, not an error.
fn empty_seo() -> PublicSeo {
    PublicSeo {
        title: String::new(),
        description: None,
        social_image_url: None,
        canonical_url: None,
        json_ld: None,
    }
}

fn to_public_seo(resolved: ResolvedSeo) -> PublicSeo {
    PublicSeo {
        title: resolved.title,
        description: resolved.description,
        social_image_url: resolved.social_image_url,
        canonical_url: resolved.canonical_url,
        json_ld: resolved.json_ld,
    }
}

/// The `SeoMeta` slug the column stores.
fn seo_entity_type(entity_type: SeoEntityType) -> &'static str {
    match entity_type {
        SeoEntityType::Store => "store",
        SeoEntityType::Department => "department",
        SeoEntityType::Category => "category",
        SeoEntityType::Tag => "tag",
        SeoEntityType::Product => "product",
        SeoEntityType::Kit => "kit",
        SeoEntityType::Coupon => "coupon",
    }
}

/// One `SeoMeta` row for an entity, or `None` when the panel never overrode it.
async fn seo_meta(
    pool: &sqlx::PgPool,
    tenant: &TenantId,
    entity_type: SeoEntityType,
    entity_id: &str,
) -> Result<Option<SeoMetaRow>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT title, description,
               "canonicalUrl" AS canonical_url,
               "socialImageUrl" AS social_image_url,
               "jsonLd" AS json_ld
        FROM public."SeoMeta"
        WHERE "tenantId" = $1 AND "entityType" = $2 AND "entityId" = $3
        "#,
        tenant.as_str(),
        seo_entity_type(entity_type),
        entity_id,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| SeoMetaRow {
        entity_type,
        entity_id: entity_id.to_owned(),
        title: row.title,
        description: row.description,
        canonical_url: row.canonical_url,
        social_image_url: row.social_image_url,
        json_ld: row.json_ld,
    }))
}

/// The store-level templates behind a resolved page.
async fn store_seo_defaults(
    pool: &sqlx::PgPool,
    tenant: &TenantId,
) -> Result<Option<StoreSeoDefaults>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT "seoTitleTemplate" AS seo_title_template,
               "seoDescriptionTemplate" AS seo_description_template,
               "seoSocialImageUrl" AS seo_social_image_url
        FROM public."StoreSettings"
        WHERE "tenantId" = $1
        "#,
        tenant.as_str(),
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| StoreSeoDefaults {
        seo_title_template: row.seo_title_template,
        seo_description_template: row.seo_description_template,
        seo_social_image_url: row.seo_social_image_url,
    }))
}

/// A `Product` row, with the columns the public reads decide on.
#[derive(Debug, Clone, sqlx::FromRow)]
struct ProductRow {
    id: String,
    name: String,
    description: Option<String>,
    image_url: Option<String>,
    available: bool,
    archived: bool,
    hidden: bool,
    private: bool,
    sort_order: i32,
    subcategory_id: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct VariationRow {
    id: String,
    product_id: String,
    name: String,
    price_cents: i32,
    stock_mode: String,
    stock_qty: Option<i32>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct TagRow {
    product_id: String,
    name: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
struct BadgeRow {
    product_id: String,
    id: String,
    name: String,
    image_url: String,
}

/// The three related reads of a product set, grouped by product id and already
/// ordered by their own statements.
#[derive(Debug, Default)]
struct ProductParts {
    variations: HashMap<String, Vec<VariationRow>>,
    tags: HashMap<String, Vec<String>>,
    badges: HashMap<String, Vec<PublicBadge>>,
}

/// A sellable product. A product with no variation has no price; the contract
/// requires a non-negative integer, so an empty set floors at 0 — the menu
/// never asks for one (it drops variationless products first), the direct URL
/// read still answers the row.
fn to_public_product(parts: &ProductParts, row: &ProductRow) -> PublicProduct {
    let variations = parts
        .variations
        .get(&row.id)
        .map(Vec::as_slice)
        .unwrap_or_default();

    PublicProduct {
        id: row.id.clone(),
        name: row.name.clone(),
        description: row.description.clone(),
        image_url: row.image_url.clone(),
        available: row.available,
        archived: row.archived,
        sort_order: row.sort_order,
        from_price_cents: variations
            .iter()
            .map(|variation| variation.price_cents)
            .min()
            .unwrap_or(0),
        variations: variations
            .iter()
            .map(|variation| PublicVariation {
                id: variation.id.clone(),
                name: variation.name.clone(),
                price_cents: variation.price_cents,
                available: variation.stock_mode == "unlimited"
                    || variation.stock_qty.unwrap_or(0) > 0,
            })
            .collect(),
        tags: parts.tags.get(&row.id).cloned().unwrap_or_default(),
        badges: parts.badges.get(&row.id).cloned().unwrap_or_default(),
    }
}

fn nutrition_basis(value: &str) -> NutritionBasis {
    match value {
        "liquid" => NutritionBasis::Liquid,
        _ => NutritionBasis::Solid,
    }
}

fn nutrition_label_format(value: &str) -> NutritionLabelFormat {
    match value {
        "simplified" => NutritionLabelFormat::Simplified,
        _ => NutritionLabelFormat::Vertical,
    }
}

fn nutrition_source(value: &str) -> NutritionSource {
    match value {
        "lab" => NutritionSource::Lab,
        "supplier_label" => NutritionSource::SupplierLabel,
        "database" => NutritionSource::Database,
        "estimate" => NutritionSource::Estimate,
        _ => NutritionSource::Manual,
    }
}

/// The storefront's identity plus its resolved SEO. A tenant id with no row
/// answers the empty shape, never an error.
pub async fn store(pool: &sqlx::PgPool, tenant: &TenantId) -> Result<PublicStore, sqlx::Error> {
    let tenant_row = sqlx::query!(
        r#"
        SELECT id, slug, "displayName" AS display_name
        FROM public."Tenant"
        WHERE id = $1
        "#,
        tenant.as_str(),
    )
    .fetch_optional(pool)
    .await?;

    let Some(tenant_row) = tenant_row else {
        return Ok(PublicStore {
            tenant_id: None,
            slug: String::new(),
            display_name: String::new(),
            seo: empty_seo(),
        });
    };

    // The store's own row is the entity; there is no store row behind it.
    let seo = resolve_seo(&SeoInput {
        entity: seo_meta(pool, tenant, SeoEntityType::Store, &tenant_row.id).await?,
        store_row: None,
        settings: store_seo_defaults(pool, tenant).await?,
        context: SeoContext {
            store_name: tenant_row.display_name.clone(),
            entity_name: tenant_row.display_name.clone(),
            city: None,
        },
        fallback_title: tenant_row.display_name.clone(),
        fallback_description: None,
    });

    Ok(PublicStore {
        tenant_id: Some(tenant_row.id),
        slug: tenant_row.slug,
        display_name: tenant_row.display_name,
        seo: to_public_seo(seo),
    })
}

/// The buyer-facing catalog, nested department → category → subcategory →
/// product. Inactive levels and groups with no sellable product are dropped.
///
/// `department_filter` narrows the answer to one department's subtree; a
/// filtered answer carries no `uncategorized` products, because a product
/// without a subcategory belongs to no department.
pub async fn menu(
    pool: &sqlx::PgPool,
    tenant: &TenantId,
    department_filter: Option<&str>,
) -> Result<PublicMenu, sqlx::Error> {
    let departments = sqlx::query!(
        r#"
        SELECT id, name
        FROM public."Department"
        WHERE "tenantId" = $1 AND active = true
        ORDER BY name, id
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let categories = sqlx::query!(
        r#"
        SELECT id, name, "sortOrder" AS sort_order
        FROM public."Category"
        WHERE "tenantId" = $1 AND active = true
        ORDER BY "sortOrder", name
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let subcategories = sqlx::query!(
        r#"
        SELECT id, name, "categoryId" AS category_id, "sortOrder" AS sort_order
        FROM public."Subcategory"
        WHERE "tenantId" = $1 AND active = true
        ORDER BY "sortOrder", name
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let links = sqlx::query!(
        r#"
        SELECT "categoryId" AS category_id, "departmentId" AS department_id
        FROM public."CategoryDepartment"
        WHERE "tenantId" = $1
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let products = sqlx::query_as!(
        ProductRow,
        r#"
        SELECT id, name, description,
               "imageUrl" AS image_url,
               available, archived, hidden, "private" AS private,
               "sortOrder" AS sort_order,
               "subcategoryId" AS subcategory_id
        FROM public."Product"
        WHERE "tenantId" = $1
        ORDER BY "sortOrder", name
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let variations = sqlx::query_as!(
        VariationRow,
        r#"
        SELECT id, "productId" AS product_id, name, "priceCents" AS price_cents,
               "stockMode" AS stock_mode, "stockQty" AS stock_qty
        FROM public."Variation"
        WHERE "tenantId" = $1
        ORDER BY name
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let tags = sqlx::query_as!(
        TagRow,
        r#"
        SELECT product_tag."productId" AS product_id, tag.name AS name
        FROM public."ProductTag" AS product_tag
        JOIN public."Tag" AS tag
          ON tag.id = product_tag."tagId" AND tag."tenantId" = product_tag."tenantId"
        WHERE product_tag."tenantId" = $1 AND tag."isActive" = true
        ORDER BY tag.name
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let badges = sqlx::query_as!(
        BadgeRow,
        r#"
        SELECT product_badge."productId" AS product_id, badge.id AS id,
               badge.name AS name, badge."imageUrl" AS image_url
        FROM public."ProductBadge" AS product_badge
        JOIN public."Badge" AS badge
          ON badge.id = product_badge."badgeId" AND badge."tenantId" = product_badge."tenantId"
        WHERE product_badge."tenantId" = $1 AND badge."isActive" = true
        ORDER BY badge."sortOrder"
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let mut parts = ProductParts::default();

    for variation in variations {
        parts
            .variations
            .entry(variation.product_id.clone())
            .or_default()
            .push(variation);
    }

    for tag in tags {
        parts.tags.entry(tag.product_id).or_default().push(tag.name);
    }

    for badge in badges {
        parts
            .badges
            .entry(badge.product_id)
            .or_default()
            .push(PublicBadge {
                id: badge.id,
                name: badge.name,
                image_url: badge.image_url,
            });
    }

    // Inactive is nonexistent; archived, hidden and private stay out of the
    // listing, and a product with no variation has no price to show.
    let sellable: Vec<(Option<String>, PublicProduct)> = products
        .iter()
        .filter(|row| row.available && !row.archived && !row.hidden && !row.private)
        .filter(|row| parts.variations.contains_key(&row.id))
        .map(|row| (row.subcategory_id.clone(), to_public_product(&parts, row)))
        .collect();

    let mut products_by_subcategory: HashMap<&str, Vec<PublicProduct>> = HashMap::new();

    for (subcategory_id, product) in &sellable {
        if let Some(subcategory_id) = subcategory_id.as_deref() {
            products_by_subcategory
                .entry(subcategory_id)
                .or_default()
                .push(product.clone());
        }
    }

    let mut subcategories_by_category: HashMap<String, Vec<PublicSubcategory>> = HashMap::new();

    for subcategory in subcategories {
        let Some(items) = products_by_subcategory.get(subcategory.id.as_str()) else {
            continue;
        };

        subcategories_by_category
            .entry(subcategory.category_id)
            .or_default()
            .push(PublicSubcategory {
                id: subcategory.id,
                name: subcategory.name,
                sort_order: subcategory.sort_order,
                products: items.clone(),
            });
    }

    let mut department_ids_by_category: HashMap<&str, Vec<&str>> = HashMap::new();

    for link in &links {
        // A link to an inactive category publishes nothing.
        if !categories
            .iter()
            .any(|category| category.id == link.category_id)
        {
            continue;
        }

        department_ids_by_category
            .entry(link.category_id.as_str())
            .or_default()
            .push(link.department_id.as_str());
    }

    let mut categories_by_department: HashMap<String, Vec<PublicCategory>> = HashMap::new();

    for category in &categories {
        let Some(subcategory_groups) = subcategories_by_category.get(&category.id) else {
            continue;
        };

        for department_id in department_ids_by_category
            .get(category.id.as_str())
            .map(Vec::as_slice)
            .unwrap_or_default()
        {
            categories_by_department
                .entry((*department_id).to_owned())
                .or_default()
                .push(PublicCategory {
                    id: category.id.clone(),
                    name: category.name.clone(),
                    sort_order: category.sort_order,
                    subcategories: subcategory_groups.clone(),
                });
        }
    }

    let published = departments
        .iter()
        .filter(|department| department_filter.is_none_or(|id| department.id == id))
        .filter_map(|department| {
            let grouped = categories_by_department.get(&department.id)?;

            Some(PublicDepartment {
                id: department.id.clone(),
                name: department.name.clone(),
                categories: grouped.clone(),
            })
        })
        .collect();

    let uncategorized = if department_filter.is_some() {
        Vec::new()
    } else {
        sellable
            .iter()
            .filter(|(subcategory_id, _)| subcategory_id.is_none())
            .map(|(_, product)| product.clone())
            .collect()
    };

    Ok(PublicMenu {
        departments: published,
        uncategorized,
    })
}

/// The direct URL read: hidden products are reachable by design, archived ones
/// come back so the page can render the pause notice, inactive and private
/// answer `None`.
pub async fn product(
    pool: &sqlx::PgPool,
    tenant: &TenantId,
    product_id: &str,
) -> Result<Option<PublicProductDetail>, sqlx::Error> {
    let row = sqlx::query_as!(
        ProductRow,
        r#"
        SELECT id, name, description,
               "imageUrl" AS image_url,
               available, archived, hidden, "private" AS private,
               "sortOrder" AS sort_order,
               "subcategoryId" AS subcategory_id
        FROM public."Product"
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        product_id,
    )
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else {
        return Ok(None);
    };

    if !row.available || row.private {
        return Ok(None);
    }

    let variations = sqlx::query_as!(
        VariationRow,
        r#"
        SELECT id, "productId" AS product_id, name, "priceCents" AS price_cents,
               "stockMode" AS stock_mode, "stockQty" AS stock_qty
        FROM public."Variation"
        WHERE "tenantId" = $1 AND "productId" = $2
        ORDER BY name
        "#,
        tenant.as_str(),
        product_id,
    )
    .fetch_all(pool)
    .await?;

    let tags = sqlx::query!(
        r#"
        SELECT tag.name AS name
        FROM public."ProductTag" AS product_tag
        JOIN public."Tag" AS tag
          ON tag.id = product_tag."tagId" AND tag."tenantId" = product_tag."tenantId"
        WHERE product_tag."tenantId" = $1 AND product_tag."productId" = $2
          AND tag."isActive" = true
        ORDER BY tag.name
        "#,
        tenant.as_str(),
        product_id,
    )
    .fetch_all(pool)
    .await?;

    let badges = sqlx::query!(
        r#"
        SELECT badge.id AS id, badge.name AS name, badge."imageUrl" AS image_url
        FROM public."ProductBadge" AS product_badge
        JOIN public."Badge" AS badge
          ON badge.id = product_badge."badgeId" AND badge."tenantId" = product_badge."tenantId"
        WHERE product_badge."tenantId" = $1 AND product_badge."productId" = $2
          AND badge."isActive" = true
        ORDER BY badge."sortOrder"
        "#,
        tenant.as_str(),
        product_id,
    )
    .fetch_all(pool)
    .await?;

    let nutrition = sqlx::query!(
        r#"
        SELECT basis, "labelFormat" AS label_format, "source" AS source,
               "referenceAt" AS reference_at, "energyKcal" AS energy_kcal,
               "carbsMg" AS carbs_mg, "totalSugarsMg" AS total_sugars_mg,
               "addedSugarsMg" AS added_sugars_mg, "proteinMg" AS protein_mg,
               "totalFatMg" AS total_fat_mg, "saturatedFatMg" AS saturated_fat_mg,
               "transFatMg" AS trans_fat_mg, "fiberMg" AS fiber_mg,
               "sodiumMg" AS sodium_mg, "portionMilli" AS portion_milli,
               "householdMeasure" AS household_measure,
               "servingsPerPack" AS servings_per_pack,
               "showHighAddedSugar" AS show_high_added_sugar,
               "showHighSatFat" AS show_high_sat_fat,
               "showHighSodium" AS show_high_sodium,
               "updatedAt" AS updated_at
        FROM public."ProductNutrition"
        WHERE "tenantId" = $1 AND "productId" = $2 AND published = true
        "#,
        tenant.as_str(),
        product_id,
    )
    .fetch_optional(pool)
    .await?;

    let parts = ProductParts {
        variations: HashMap::from([(row.id.clone(), variations)]),
        tags: HashMap::from([(
            row.id.clone(),
            tags.into_iter().map(|tag| tag.name).collect(),
        )]),
        badges: HashMap::from([(
            row.id.clone(),
            badges
                .into_iter()
                .map(|badge| PublicBadge {
                    id: badge.id,
                    name: badge.name,
                    image_url: badge.image_url,
                })
                .collect(),
        )]),
    };

    let product = to_public_product(&parts, &row);

    // The product's own row is the entity, the store row and the store templates
    // sit behind it; `canonicalUrl`/`jsonLd` stay entity-only.
    let tenant_row = sqlx::query!(
        r#"
        SELECT "displayName" AS display_name
        FROM public."Tenant"
        WHERE id = $1
        "#,
        tenant.as_str(),
    )
    .fetch_optional(pool)
    .await?;

    let seo = resolve_seo(&SeoInput {
        entity: seo_meta(pool, tenant, SeoEntityType::Product, &row.id).await?,
        store_row: seo_meta(pool, tenant, SeoEntityType::Store, tenant.as_str()).await?,
        settings: store_seo_defaults(pool, tenant).await?,
        context: SeoContext {
            store_name: tenant_row
                .as_ref()
                .map(|tenant| tenant.display_name.clone())
                .unwrap_or_default(),
            entity_name: row.name.clone(),
            city: None,
        },
        fallback_title: row.name.clone(),
        fallback_description: row.description.clone(),
    });

    Ok(Some(PublicProductDetail {
        product,
        nutrition: nutrition.map(|row| PublicNutrition {
            basis: nutrition_basis(&row.basis),
            label_format: nutrition_label_format(&row.label_format),
            source: nutrition_source(&row.source),
            reference_at: row.reference_at.map(to_iso),
            energy_kcal: row.energy_kcal,
            carbs_mg: row.carbs_mg,
            total_sugars_mg: row.total_sugars_mg,
            added_sugars_mg: row.added_sugars_mg,
            protein_mg: row.protein_mg,
            total_fat_mg: row.total_fat_mg,
            saturated_fat_mg: row.saturated_fat_mg,
            trans_fat_mg: row.trans_fat_mg,
            fiber_mg: row.fiber_mg,
            sodium_mg: row.sodium_mg,
            portion_milli: row.portion_milli,
            household_measure: row.household_measure,
            servings_per_pack: row.servings_per_pack,
            show_high_added_sugar: row.show_high_added_sugar,
            show_high_sat_fat: row.show_high_sat_fat,
            show_high_sodium: row.show_high_sodium,
            updated_at: to_iso(row.updated_at),
        }),
        seo: to_public_seo(seo),
    }))
}

/// Every public page of one store, by path only. The catalog rows carry no
/// timestamp, so every entry reports the tenant's `updatedAt`: the last time the
/// store changed at all.
pub async fn sitemap(pool: &sqlx::PgPool, tenant: &TenantId) -> Result<PublicSitemap, sqlx::Error> {
    let tenant_row = sqlx::query!(
        r#"
        SELECT "updatedAt" AS updated_at
        FROM public."Tenant"
        WHERE id = $1
        "#,
        tenant.as_str(),
    )
    .fetch_optional(pool)
    .await?;

    let Some(tenant_row) = tenant_row else {
        return Ok(PublicSitemap {
            entries: Vec::new(),
        });
    };

    let last_modified = to_iso(tenant_row.updated_at);

    let categories = sqlx::query!(
        r#"
        SELECT id
        FROM public."Category"
        WHERE "tenantId" = $1 AND active = true
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let departments = sqlx::query!(
        r#"
        SELECT id
        FROM public."Department"
        WHERE "tenantId" = $1 AND active = true
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let tags = sqlx::query!(
        r#"
        SELECT id
        FROM public."Tag"
        WHERE "tenantId" = $1 AND "isActive" = true
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let products = sqlx::query!(
        r#"
        SELECT id
        FROM public."Product"
        WHERE "tenantId" = $1 AND available = true AND archived = false
          AND hidden = false AND "private" = false
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let kits = sqlx::query!(
        r#"
        SELECT id
        FROM public."Kit"
        WHERE "tenantId" = $1 AND available = true
        "#,
        tenant.as_str(),
    )
    .fetch_all(pool)
    .await?;

    let entry =
        |path: String, change_frequency: ChangeFrequency, priority: f64| PublicSitemapEntry {
            path,
            last_modified: last_modified.clone(),
            change_frequency,
            priority,
        };

    let mut entries = vec![
        entry("/".to_owned(), ChangeFrequency::Daily, 1.0),
        entry("/menu".to_owned(), ChangeFrequency::Daily, 0.9),
    ];

    entries.extend(categories.iter().map(|row| {
        entry(
            format!("/categorias/{}", row.id),
            ChangeFrequency::Weekly,
            0.8,
        )
    }));

    entries.extend(
        products
            .iter()
            .map(|row| entry(format!("/produtos/{}", row.id), ChangeFrequency::Daily, 0.7)),
    );

    entries.extend(departments.iter().map(|row| {
        entry(
            format!("/departamentos/{}", row.id),
            ChangeFrequency::Weekly,
            0.6,
        )
    }));

    entries.extend(
        tags.iter()
            .map(|row| entry(format!("/tags/{}", row.id), ChangeFrequency::Weekly, 0.5)),
    );

    entries.extend(
        kits.iter()
            .map(|row| entry(format!("/kits/{}", row.id), ChangeFrequency::Monthly, 0.5)),
    );

    Ok(PublicSitemap { entries })
}
