//! Tenant and membership lookups for the panel's `storeSlug` -> tenant path.
//!
//! Both are unscoped on purpose: the slug arrives before the tenant is known,
//! which is the host-style lookup `Scope::unscoped` exists for.

use sqlx::PgPool;

use super::TenantId;

/// The tenant a store slug names, or `None` when no store has it.
///
/// An archived tenant resolves for nothing: the store was closed when its last
/// owner deleted their account, and its orders are history, not a live store.
/// The slug itself is still taken — see `store_slug_taken`.
///
/// A stored id that cannot become a [`TenantId`] (blank) reads as missing,
/// never as a panic.
pub async fn tenant_by_slug(pool: &PgPool, slug: &str) -> Result<Option<TenantId>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "Tenant" WHERE slug = $1 AND "archivedAt" IS NULL"#,
    )
    .bind(slug)
    .fetch_optional(pool)
    .await?;

    Ok(row.and_then(|(id,)| TenantId::parse(&id).ok()))
}

/// Whether a tenant is still live, i.e. was not archived when its last owner
/// deleted the account.
///
/// The storefront's public reads take a tenant id from `TenantScope`, and a
/// native client caches the id it bound once. An id that outlived the store must
/// stop answering, so the claim is checked against this before any read runs.
pub async fn tenant_is_live(pool: &PgPool, tenant: &TenantId) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (
               SELECT 1 FROM "Tenant" WHERE id = $1 AND "archivedAt" IS NULL
           )"#,
    )
    .bind(tenant.as_str())
    .fetch_one(pool)
    .await?;

    Ok(row)
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
