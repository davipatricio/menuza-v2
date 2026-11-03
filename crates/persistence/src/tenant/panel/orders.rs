//! orders resource queries, ported from the Bun panel handlers.
//!
//! The state machine and the single-order reads already live in
//! [`crate::commerce::orders`]; this module only carries the fields the panel
//! adds on top: the customer's name on every row, the derived `createdAt` the
//! table sorts by, the filters the board narrows with and the display name of
//! the member behind each trail entry.

use chrono::NaiveDateTime;
use sqlx::PgPool;

use crate::tenant::TenantId;

/// One order row as the panel's list and detail read it, with its customer's
/// name joined in.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PanelOrderRow {
    pub id: String,
    pub code: String,
    pub customer_id: String,
    pub customer_name: String,
    pub subtotal_cents: i32,
    pub discount_cents: i32,
    pub shipping_cents: i32,
    pub wallet_applied_cents: i32,
    pub cashback_cents: i32,
    pub total_cents: i32,
    pub financial_status: String,
    pub fulfilment_status: String,
    pub payment_method: Option<String>,
    pub paid_at: Option<NaiveDateTime>,
    pub expires_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
}

/// The two fields a single-order read adds to the commerce row: the customer's
/// name and the creation instant the panel prints.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OrderPanelFields {
    pub customer_name: String,
    pub created_at: NaiveDateTime,
}

/// The display name behind one event's `actorMemberId`; `None` for a machine
/// action or a member that is gone.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct EventActor {
    pub event_id: String,
    pub actor_name: Option<String>,
}

/// The store's orders, newest first, with the customer's name.
///
/// Every filter is an equality on a closed enum column; an absent key means "no
/// filter", never a wildcard.
pub async fn order_list(
    pool: &PgPool,
    tenant: &TenantId,
    financial_status: Option<&str>,
    fulfilment_status: Option<&str>,
    payment_method: Option<&str>,
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
        WHERE o."tenantId" = $1
          AND ($2::text IS NULL OR o."financialStatus" = $2)
          AND ($3::text IS NULL OR o."fulfilmentStatus" = $3)
          AND ($4::text IS NULL OR o."paymentMethod" = $4)
        ORDER BY o."createdAt" DESC, o.id DESC
        "#,
    )
    .bind(tenant.as_str())
    .bind(financial_status)
    .bind(fulfilment_status)
    .bind(payment_method)
    .fetch_all(pool)
    .await
}

/// The customer's name and the creation instant of one order, or `None` when
/// the order is not this tenant's.
pub async fn order_panel_fields(
    pool: &PgPool,
    tenant: &TenantId,
    order_id: &str,
) -> Result<Option<OrderPanelFields>, sqlx::Error> {
    sqlx::query_as::<_, OrderPanelFields>(
        r#"
        SELECT c.name AS customer_name, o."createdAt" AS created_at
        FROM public."Order" o
        JOIN public."Customer" c
            ON c."tenantId" = o."tenantId" AND c.id = o."customerId"
        WHERE o."tenantId" = $1 AND o.id = $2
        "#,
    )
    .bind(tenant.as_str())
    .bind(order_id)
    .fetch_optional(pool)
    .await
}

/// The member name behind each trail entry, joined in one read.
///
/// `Member` is not tenant-scoped — an account spans stores — but the event it is
/// joined to is, so the statement still binds the tenant.
pub async fn event_actors(
    pool: &PgPool,
    tenant: &TenantId,
    order_id: &str,
) -> Result<Vec<EventActor>, sqlx::Error> {
    sqlx::query_as::<_, EventActor>(
        r#"
        SELECT e.id AS event_id, COALESCE(m.name, m.email) AS actor_name
        FROM public."OrderEvent" e
        LEFT JOIN public."Member" m ON m.id = e."actorMemberId"
        WHERE e."tenantId" = $1 AND e."orderId" = $2
          AND e."actorMemberId" IS NOT NULL
        "#,
    )
    .bind(tenant.as_str())
    .bind(order_id)
    .fetch_all(pool)
    .await
}
