//! push subdomain queries, ported from the Bun push handlers.
//!
//! `PushPreference` and `PushSubscription` are tenant-scoped: every read, write
//! and delete binds `"tenantId"`. The one exception is the endpoint lookup,
//! because `PushSubscription_endpoint_key` is global: it must find the row that
//! belongs to another tenant so the handler can answer `FORBIDDEN` instead of
//! colliding with the unique index.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::{TenantId, begin_scoped};

/// A `PushSubscription` row as stored.
pub struct PushSubscriptionRow {
    pub id: String,
    pub tenant_id: String,
    pub member_id: String,
}

/// The subscription that owns this endpoint, whichever tenant it belongs to.
///
/// Cross-tenant on purpose: the endpoint is globally unique, and the handler
/// uses the row to refuse a device registered to someone else.
pub async fn push_subscription_by_endpoint(
    pool: &PgPool,
    endpoint: &str,
) -> Result<Option<PushSubscriptionRow>, sqlx::Error> {
    type Row = (String, String, String);

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, "tenantId", "memberId"
           FROM "PushSubscription"
           WHERE endpoint = $1"#,
    )
    .bind(endpoint)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id, tenant_id, member_id)| PushSubscriptionRow {
        id,
        tenant_id,
        member_id,
    }))
}

/// Refreshes the keys and expiry of the caller's own subscription.
pub async fn push_subscription_update(
    pool: &PgPool,
    tenant: &TenantId,
    id: &str,
    p256dh: &str,
    auth: &str,
    expiration_time: Option<NaiveDateTime>,
    now: NaiveDateTime,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"UPDATE "PushSubscription"
           SET p256dh = $3, auth = $4, "expirationTime" = $5, "updatedAt" = $6
           WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(id)
    .bind(p256dh)
    .bind(auth)
    .bind(expiration_time)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// Inserts one subscription for a member of a tenant.
#[allow(clippy::too_many_arguments)]
pub async fn push_subscription_insert(
    pool: &PgPool,
    tenant: &TenantId,
    member_id: &str,
    endpoint: &str,
    p256dh: &str,
    auth: &str,
    expiration_time: Option<NaiveDateTime>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "PushSubscription"
               (id, "tenantId", "memberId", endpoint, p256dh, auth, "expirationTime", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)"#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(member_id)
    .bind(endpoint)
    .bind(p256dh)
    .bind(auth)
    .bind(expiration_time)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Removes the caller's subscription for one endpoint. A missing row is a no-op.
pub async fn push_subscription_delete(
    pool: &PgPool,
    tenant: &TenantId,
    member_id: &str,
    endpoint: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"DELETE FROM "PushSubscription"
           WHERE "tenantId" = $1 AND "memberId" = $2 AND endpoint = $3"#,
    )
    .bind(tenant.as_str())
    .bind(member_id)
    .bind(endpoint)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// One live subscription, ready to be posted to. The row id is what a 404/410
/// prunes; the endpoint is never logged.
pub struct PushTarget {
    pub id: String,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
}

/// The members of one tenant who enabled `event` and still belong to it.
///
/// The membership join is the point: a preference row outlives the membership,
/// and a member who left the store stops receiving its notifications.
pub async fn push_event_members(
    pool: &PgPool,
    tenant: &TenantId,
    event: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String,)>(
        r#"SELECT DISTINCT p."memberId"
           FROM "PushPreference" p
           JOIN "TenantMembership" m
             ON m."tenantId" = p."tenantId" AND m."memberId" = p."memberId"
           WHERE p."tenantId" = $1 AND p.event = $2
           ORDER BY 1"#,
    )
    .bind(tenant.as_str())
    .bind(event)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(member_id,)| member_id).collect())
}

/// Every subscription of the named members in one tenant. An empty list asks
/// the database nothing.
pub async fn push_subscriptions_for_members(
    pool: &PgPool,
    tenant: &TenantId,
    member_ids: &[String],
) -> Result<Vec<PushTarget>, sqlx::Error> {
    if member_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        r#"SELECT id, endpoint, p256dh, auth
           FROM "PushSubscription"
           WHERE "tenantId" = $1 AND "memberId" = ANY($2)
           ORDER BY "createdAt", id"#,
    )
    .bind(tenant.as_str())
    .bind(member_ids)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, endpoint, p256dh, auth)| PushTarget {
            id,
            endpoint,
            p256dh,
            auth,
        })
        .collect())
}

/// Drops one subscription the push service reported gone. Only the sender
/// knows a row is dead, so this is the one delete that is not member-driven.
pub async fn push_subscription_delete_by_id(
    pool: &PgPool,
    tenant: &TenantId,
    id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        r#"DELETE FROM "PushSubscription"
           WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

/// The events a member enabled for one tenant.
pub async fn push_preferences(
    pool: &PgPool,
    tenant: &TenantId,
    member_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String,)>(
        r#"SELECT event FROM "PushPreference"
           WHERE "tenantId" = $1 AND "memberId" = $2
           ORDER BY "createdAt", id"#,
    )
    .bind(tenant.as_str())
    .bind(member_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|(event,)| event).collect())
}

/// Replaces every preference row of one member in one transaction, so a failed
/// insert never leaves the member with an empty preference set.
pub async fn push_preferences_replace(
    pool: &PgPool,
    tenant: &TenantId,
    member_id: &str,
    events: &[&str],
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    sqlx::query(r#"DELETE FROM "PushPreference" WHERE "tenantId" = $1 AND "memberId" = $2"#)
        .bind(tenant.as_str())
        .bind(member_id)
        .execute(&mut **tx)
        .await?;

    for event in events {
        sqlx::query(
            r#"INSERT INTO "PushPreference" (id, "tenantId", "memberId", event, "createdAt")
               VALUES ($1, $2, $3, $4, $5)"#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(tenant.as_str())
        .bind(member_id)
        .bind(event)
        .bind(now)
        .execute(&mut **tx)
        .await?;
    }

    tx.commit().await
}
