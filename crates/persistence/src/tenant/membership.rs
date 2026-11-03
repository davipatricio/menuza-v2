//! Tenant and membership lookups for the panel's `storeSlug` -> tenant path.
//!
//! Both are unscoped on purpose: the slug arrives before the tenant is known,
//! which is the host-style lookup `Scope::unscoped` exists for.

use sqlx::PgPool;

use super::TenantId;

/// The tenant a store slug names, or `None` when no store has it.
///
/// A stored id that cannot become a [`TenantId`] (blank) reads as missing,
/// never as a panic.
pub async fn tenant_by_slug(pool: &PgPool, slug: &str) -> Result<Option<TenantId>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(r#"SELECT id FROM "Tenant" WHERE slug = $1"#)
        .bind(slug)
        .fetch_optional(pool)
        .await?;

    Ok(row.and_then(|(id,)| TenantId::parse(&id).ok()))
}

/// The stored role string for one member of one tenant, if the membership
/// exists.
pub async fn membership_role(
    pool: &PgPool,
    tenant: &TenantId,
    member_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_as::<_, (String,)>(
        r#"SELECT role FROM "TenantMembership" WHERE "tenantId" = $1 AND "memberId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(member_id)
    .fetch_optional(pool)
    .await
    .map(|row| row.map(|(role,)| role))
}
