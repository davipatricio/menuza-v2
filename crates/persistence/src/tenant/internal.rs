//! internal subdomain queries: storefront host -> tenant resolution.
//!
//! `Domain` is tenant-scoped, but the lookup runs before any tenant is known —
//! that is exactly what it resolves — so this is the unscoped exception the
//! crate root names. No wildcard: a host matches a whole `Domain.host` value.

use sqlx::PgPool;

use super::TenantId;

/// The tenant a storefront host names, or `None` when no `Domain` row has it.
///
/// The proxy already lowercases the host; `lower($1)` keeps a direct internal
/// caller from missing a row over case. A stored id that cannot become a
/// [`TenantId`] reads as missing, never as a panic.
pub async fn tenant_by_host(pool: &PgPool, host: &str) -> Result<Option<TenantId>, sqlx::Error> {
    let row =
        sqlx::query_as::<_, (String,)>(r#"SELECT "tenantId" FROM "Domain" WHERE host = lower($1)"#)
            .bind(host)
            .fetch_optional(pool)
            .await?;

    Ok(row.and_then(|(id,)| TenantId::parse(&id).ok()))
}
