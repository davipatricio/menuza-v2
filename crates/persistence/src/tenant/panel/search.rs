//! search resource queries, ported from the Bun panel handler.
//!
//! Each query returns a window of twenty rows, never the answer: the ranking
//! runs over that window and the handler then cuts each group to five. Twenty
//! rows straight from `name ASC` would drop a prefix match that sorts late.
//! Matching is `ILIKE`; the caller passes an already escaped pattern.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;

/// Rows each query fetches, before the ranking and the per-group cut.
const WINDOW_LIMIT: i32 = 20;

/// The store's products whose name matches.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchProduct {
    pub id: String,
    pub name: String,
    pub available: bool,
}

/// A live coupon whose code matches, with the window the status is derived from.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchCoupon {
    pub id: String,
    pub code: String,
    pub description: Option<String>,
    pub status: String,
    pub ends_at: Option<NaiveDateTime>,
}

/// A customer whose name or e-mail matches.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchCustomer {
    pub id: String,
    pub name: String,
    pub email: String,
}

/// A tag whose name matches.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchTag {
    pub id: String,
    pub name: String,
    pub is_active: bool,
}

/// A category whose name matches.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchCategory {
    pub id: String,
    pub name: String,
}

/// A department whose name matches.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchDepartment {
    pub id: String,
    pub name: String,
    pub active: bool,
}

/// A badge whose name matches.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchBadge {
    pub id: String,
    pub name: String,
    pub is_active: bool,
}

/// A subcategory whose name matches.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SearchSubcategory {
    pub id: String,
    pub name: String,
}

/// One window per entity kind, in the order the palette renders the groups.
pub struct SearchWindows {
    pub products: Vec<SearchProduct>,
    pub coupons: Vec<SearchCoupon>,
    pub customers: Vec<SearchCustomer>,
    pub tags: Vec<SearchTag>,
    pub categories: Vec<SearchCategory>,
    pub departments: Vec<SearchDepartment>,
    pub badges: Vec<SearchBadge>,
    pub subcategories: Vec<SearchSubcategory>,
}

/// The twenty-row window of every kind the palette searches.
pub async fn search_windows(
    pool: &PgPool,
    tenant: &TenantId,
    pattern: &str,
) -> Result<SearchWindows, sqlx::Error> {
    let products = sqlx::query_as::<_, SearchProduct>(
        r#"
        SELECT id, name, available
        FROM public."Product"
        WHERE "tenantId" = $1 AND name ILIKE $2
        ORDER BY name ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    let coupons = sqlx::query_as::<_, SearchCoupon>(
        r#"
        SELECT id, code, description, status, "endsAt" AS ends_at
        FROM public."Coupon"
        WHERE "tenantId" = $1 AND "deletedAt" IS NULL AND code ILIKE $2
        ORDER BY code ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    let customers = sqlx::query_as::<_, SearchCustomer>(
        r#"
        SELECT id, name, email
        FROM public."Customer"
        WHERE "tenantId" = $1 AND (name ILIKE $2 OR email ILIKE $2)
        ORDER BY name ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    let tags = sqlx::query_as::<_, SearchTag>(
        r#"
        SELECT id, name, "isActive" AS is_active
        FROM public."Tag"
        WHERE "tenantId" = $1 AND name ILIKE $2
        ORDER BY name ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    let categories = sqlx::query_as::<_, SearchCategory>(
        r#"
        SELECT id, name
        FROM public."Category"
        WHERE "tenantId" = $1 AND name ILIKE $2
        ORDER BY name ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    let departments = sqlx::query_as::<_, SearchDepartment>(
        r#"
        SELECT id, name, active
        FROM public."Department"
        WHERE "tenantId" = $1 AND name ILIKE $2
        ORDER BY name ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    let badges = sqlx::query_as::<_, SearchBadge>(
        r#"
        SELECT id, name, "isActive" AS is_active
        FROM public."Badge"
        WHERE "tenantId" = $1 AND name ILIKE $2
        ORDER BY name ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    let subcategories = sqlx::query_as::<_, SearchSubcategory>(
        r#"
        SELECT id, name
        FROM public."Subcategory"
        WHERE "tenantId" = $1 AND name ILIKE $2
        ORDER BY name ASC, id ASC
        LIMIT $3
        "#,
    )
    .bind(tenant.as_str())
    .bind(pattern)
    .bind(WINDOW_LIMIT)
    .fetch_all(pool)
    .await?;

    Ok(SearchWindows {
        products,
        coupons,
        customers,
        tags,
        categories,
        departments,
        badges,
        subcategories,
    })
}
