//! seo resource queries, ported from the Bun panel support.
//!
//! `SeoMeta` holds one override row per `(tenantId, entityType, entityId)`;
//! the store-level templates live in `StoreSettings`. A row with all five
//! fields empty is not an override, so the list reports `hasOverride` from the
//! non-empty rows only, exactly as `saveSeo` deletes a row that resolved to
//! nothing.

use chrono::NaiveDateTime;
use contract::tenant::panel::seo::SeoEntityType;
use domain::seo::{SeoEntityType as DomainEntityType, SeoMetaRow, StoreSeoDefaults};
use sqlx::PgPool;

use super::super::TenantId;

/// The five editable columns as a write payload.
pub struct SeoFieldsWrite {
    pub title: Option<String>,
    pub description: Option<String>,
    pub canonical_url: Option<String>,
    pub social_image_url: Option<String>,
    pub json_ld: Option<String>,
}

impl SeoFieldsWrite {
    /// A row with nothing set is the same as no row.
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.canonical_url.is_none()
            && self.social_image_url.is_none()
            && self.json_ld.is_none()
    }
}

/// One named row of an entity type, as the SEO list screen shows it.
pub struct NamedEntity {
    pub id: String,
    pub name: String,
}

/// One override row, or `None` when the entity has no SEO of its own.
pub async fn seo_meta_find(
    pool: &PgPool,
    tenant: &TenantId,
    entity_type: SeoEntityType,
    entity_id: &str,
) -> Result<Option<SeoMetaRow>, sqlx::Error> {
    type Row = (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    );

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT "entityId", title, description, "canonicalUrl", "socialImageUrl", "jsonLd"
           FROM "SeoMeta"
           WHERE "tenantId" = $1 AND "entityType" = $2 AND "entityId" = $3"#,
    )
    .bind(tenant.as_str())
    .bind(entity_type.as_str())
    .bind(entity_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(entity_id, title, description, canonical_url, social_image_url, json_ld)| SeoMetaRow {
            entity_type: to_domain(entity_type),
            entity_id,
            title,
            description,
            canonical_url,
            social_image_url,
            json_ld,
        },
    ))
}

/// Every `(entityType, entityId)` that carries at least one non-empty field.
pub async fn seo_override_keys(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<(SeoEntityType, String)>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, String)>(
        r#"SELECT "entityType", "entityId"
           FROM "SeoMeta"
           WHERE "tenantId" = $1
             AND ((title IS NOT NULL AND title <> '')
               OR (description IS NOT NULL AND description <> '')
               OR ("canonicalUrl" IS NOT NULL AND "canonicalUrl" <> '')
               OR ("socialImageUrl" IS NOT NULL AND "socialImageUrl" <> '')
               OR ("jsonLd" IS NOT NULL AND "jsonLd" <> ''))"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .filter_map(|(entity_type, entity_id)| {
            SeoEntityType::parse(&entity_type).map(|entity_type| (entity_type, entity_id))
        })
        .collect())
}

/// Upserts one entity's override on the unique `(tenantId, entityType,
/// entityId)` key, so two tabs cannot lose each other's save.
pub async fn seo_meta_upsert(
    pool: &PgPool,
    tenant: &TenantId,
    entity_type: SeoEntityType,
    entity_id: &str,
    fields: &SeoFieldsWrite,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "SeoMeta"
               (id, "tenantId", "entityType", "entityId", title, description,
                "canonicalUrl", "socialImageUrl", "jsonLd")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT ("tenantId", "entityType", "entityId")
           DO UPDATE SET title = EXCLUDED.title,
                         description = EXCLUDED.description,
                         "canonicalUrl" = EXCLUDED."canonicalUrl",
                         "socialImageUrl" = EXCLUDED."socialImageUrl",
                         "jsonLd" = EXCLUDED."jsonLd""#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(entity_type.as_str())
    .bind(entity_id)
    .bind(&fields.title)
    .bind(&fields.description)
    .bind(&fields.canonical_url)
    .bind(&fields.social_image_url)
    .bind(&fields.json_ld)
    .execute(pool)
    .await?;

    Ok(())
}

/// Drops one entity's override; a missing row is a no-op, not an error.
pub async fn seo_meta_delete(
    pool: &PgPool,
    tenant: &TenantId,
    entity_type: SeoEntityType,
    entity_id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"DELETE FROM "SeoMeta"
           WHERE "tenantId" = $1 AND "entityType" = $2 AND "entityId" = $3"#,
    )
    .bind(tenant.as_str())
    .bind(entity_type.as_str())
    .bind(entity_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// The tenant's store-level SEO row, or `None` when it never saved any.
pub async fn store_seo_defaults(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Option<StoreSeoDefaults>, sqlx::Error> {
    let row = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>)>(
        r#"SELECT "seoTitleTemplate", "seoDescriptionTemplate", "seoSocialImageUrl"
           FROM "StoreSettings" WHERE "tenantId" = $1"#,
    )
    .bind(tenant.as_str())
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(seo_title_template, seo_description_template, seo_social_image_url)| StoreSeoDefaults {
            seo_title_template,
            seo_description_template,
            seo_social_image_url,
        },
    ))
}

/// Upserts the store-level templates on the unique `tenantId` key, rather than
/// read-then-write.
pub async fn store_seo_defaults_upsert(
    pool: &PgPool,
    tenant: &TenantId,
    defaults: &StoreSeoDefaults,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "StoreSettings"
               (id, "tenantId", "seoTitleTemplate", "seoDescriptionTemplate",
                "seoSocialImageUrl", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT ("tenantId")
           DO UPDATE SET "seoTitleTemplate" = EXCLUDED."seoTitleTemplate",
                         "seoDescriptionTemplate" = EXCLUDED."seoDescriptionTemplate",
                         "seoSocialImageUrl" = EXCLUDED."seoSocialImageUrl",
                         "updatedAt" = EXCLUDED."updatedAt""#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(&defaults.seo_title_template)
    .bind(&defaults.seo_description_template)
    .bind(&defaults.seo_social_image_url)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// The named rows of one entity type, in the order its own screen lists them.
///
/// `Store` is the tenant itself and has no table of its own; the caller names
/// it from the resolved store.
pub async fn seo_entity_names(
    pool: &PgPool,
    tenant: &TenantId,
    entity_type: SeoEntityType,
) -> Result<Vec<NamedEntity>, sqlx::Error> {
    let rows: Vec<(String, String)> = match entity_type {
        SeoEntityType::Store => return Ok(Vec::new()),
        SeoEntityType::Product => {
            sqlx::query_as(r#"SELECT id, name FROM "Product" WHERE "tenantId" = $1 ORDER BY name"#)
                .bind(tenant.as_str())
                .fetch_all(pool)
                .await?
        }
        SeoEntityType::Kit => {
            sqlx::query_as(r#"SELECT id, name FROM "Kit" WHERE "tenantId" = $1 ORDER BY name"#)
                .bind(tenant.as_str())
                .fetch_all(pool)
                .await?
        }
        SeoEntityType::Category => {
            sqlx::query_as(
                r#"SELECT id, name FROM "Category" WHERE "tenantId" = $1 ORDER BY "sortOrder""#,
            )
            .bind(tenant.as_str())
            .fetch_all(pool)
            .await?
        }
        SeoEntityType::Department => {
            sqlx::query_as(
                r#"SELECT id, name FROM "Department" WHERE "tenantId" = $1 ORDER BY name"#,
            )
            .bind(tenant.as_str())
            .fetch_all(pool)
            .await?
        }
        SeoEntityType::Tag => {
            sqlx::query_as(r#"SELECT id, name FROM "Tag" WHERE "tenantId" = $1 ORDER BY name"#)
                .bind(tenant.as_str())
                .fetch_all(pool)
                .await?
        }
        // A coupon is addressed to the buyer by its code, so the code is its
        // name and the list is ordered by it.
        SeoEntityType::Coupon => {
            sqlx::query_as(r#"SELECT id, code FROM "Coupon" WHERE "tenantId" = $1 ORDER BY code"#)
                .bind(tenant.as_str())
                .fetch_all(pool)
                .await?
        }
    };

    Ok(rows
        .into_iter()
        .map(|(id, name)| NamedEntity { id, name })
        .collect())
}

/// The entity's own name (the coupon's code), or `None` when this tenant has no
/// such row. The explicit `tenantId` is what stops another store's id from
/// resolving.
pub async fn seo_entity_name(
    pool: &PgPool,
    tenant: &TenantId,
    entity_type: SeoEntityType,
    entity_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let row: Option<(String,)> = match entity_type {
        SeoEntityType::Store => return Ok(None),
        SeoEntityType::Product => {
            sqlx::query_as(r#"SELECT name FROM "Product" WHERE "tenantId" = $1 AND id = $2"#)
                .bind(tenant.as_str())
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
        }
        SeoEntityType::Kit => {
            sqlx::query_as(r#"SELECT name FROM "Kit" WHERE "tenantId" = $1 AND id = $2"#)
                .bind(tenant.as_str())
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
        }
        SeoEntityType::Category => {
            sqlx::query_as(r#"SELECT name FROM "Category" WHERE "tenantId" = $1 AND id = $2"#)
                .bind(tenant.as_str())
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
        }
        SeoEntityType::Department => {
            sqlx::query_as(r#"SELECT name FROM "Department" WHERE "tenantId" = $1 AND id = $2"#)
                .bind(tenant.as_str())
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
        }
        SeoEntityType::Tag => {
            sqlx::query_as(r#"SELECT name FROM "Tag" WHERE "tenantId" = $1 AND id = $2"#)
                .bind(tenant.as_str())
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
        }
        SeoEntityType::Coupon => {
            sqlx::query_as(r#"SELECT code FROM "Coupon" WHERE "tenantId" = $1 AND id = $2"#)
                .bind(tenant.as_str())
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
        }
    };

    Ok(row.map(|(name,)| name))
}

fn to_domain(entity_type: SeoEntityType) -> DomainEntityType {
    match entity_type {
        SeoEntityType::Store => DomainEntityType::Store,
        SeoEntityType::Department => DomainEntityType::Department,
        SeoEntityType::Category => DomainEntityType::Category,
        SeoEntityType::Tag => DomainEntityType::Tag,
        SeoEntityType::Product => DomainEntityType::Product,
        SeoEntityType::Kit => DomainEntityType::Kit,
        SeoEntityType::Coupon => DomainEntityType::Coupon,
    }
}
