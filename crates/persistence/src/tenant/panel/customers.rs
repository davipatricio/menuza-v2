//! customers resource queries, ported from the Bun panel support.
//!
//! The order count and the total spent are derived from the store's own orders
//! on every read rather than stored, so the customer list and the detail page
//! can never disagree with the order list.

use sqlx::PgPool;

use super::super::TenantId;
use crate::tenant::panel::orders::PanelOrderRow;

/// One customer row with the totals derived from their orders in this store.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CustomerRow {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub orders_count: i64,
    pub total_spent_cents: i64,
}

/// Every customer of the store, by name, with their order totals.
///
/// A customer with no order keeps a zero count and a zero total, which is what
/// the left join is for; the sum is coalesced so the row is never null.
pub async fn customer_list(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<CustomerRow>, sqlx::Error> {
    sqlx::query_as::<_, CustomerRow>(
        r#"
        SELECT c.id, c.name, c.email, c.phone,
               count(o.id) AS orders_count,
               COALESCE(sum(o."totalCents"), 0) AS total_spent_cents
        FROM public."Customer" c
        LEFT JOIN public."Order" o
            ON o."tenantId" = c."tenantId" AND o."customerId" = c.id
        WHERE c."tenantId" = $1
        GROUP BY c.id, c.name, c.email, c.phone
        ORDER BY c.name ASC, c.id ASC
        "#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await
}

/// One customer with their totals, or `None` when the id is not this store's.
pub async fn customer_row(
    pool: &PgPool,
    tenant: &TenantId,
    customer_id: &str,
) -> Result<Option<CustomerRow>, sqlx::Error> {
    sqlx::query_as::<_, CustomerRow>(
        r#"
        SELECT c.id, c.name, c.email, c.phone,
               count(o.id) AS orders_count,
               COALESCE(sum(o."totalCents"), 0) AS total_spent_cents
        FROM public."Customer" c
        LEFT JOIN public."Order" o
            ON o."tenantId" = c."tenantId" AND o."customerId" = c.id
        WHERE c."tenantId" = $1 AND c.id = $2
        GROUP BY c.id, c.name, c.email, c.phone
        "#,
    )
    .bind(tenant.as_str())
    .bind(customer_id)
    .fetch_optional(pool)
    .await
}

/// The customer's orders, newest first, with the joined name the panel prints.
pub async fn customer_orders(
    pool: &PgPool,
    tenant: &TenantId,
    customer_id: &str,
) -> Result<Vec<PanelOrderRow>, sqlx::Error> {
    sqlx::query_as::<_, PanelOrderRow>(
        r#"
        SELECT o.id, o.code, o."customerId" AS customer_id,
               c.name AS customer_name,
               o."subtotalCents" AS subtotal_cents,
               o."discountCents" AS discount_cents,
               o."shippingCents" AS shipping_cents,
               o."walletAppliedCents" AS wallet_applied_cents,
               o."cashbackCents" AS cashback_cents,
               o."totalCents" AS total_cents,
               o."financialStatus" AS financial_status,
               o."fulfilmentStatus" AS fulfilment_status,
               o."paymentMethod" AS payment_method,
               o."paidAt" AS paid_at,
               o."expiresAt" AS expires_at,
               o."createdAt" AS created_at
        FROM public."Order" o
        JOIN public."Customer" c
            ON c."tenantId" = o."tenantId" AND c.id = o."customerId"
        WHERE o."tenantId" = $1 AND o."customerId" = $2
        ORDER BY o."createdAt" DESC, o.id DESC
        "#,
    )
    .bind(tenant.as_str())
    .bind(customer_id)
    .fetch_all(pool)
    .await
}
