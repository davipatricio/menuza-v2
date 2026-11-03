//! orders subdomain queries, ported from the Bun persistence layer.
//!
//! The order state machine lives here because the write path enforces it: a
//! legal tuple in [`TRANSITIONS`], a capability the actor holds, and a reason
//! when the rule demands one. Financial and fulfilment are independent axes, so
//! paying an order never moves fulfilment.
//!
//! Every statement binds `"tenantId"`. Writes open [`begin_scoped`] and lock the
//! order row before reading the state they are about to change.

use chrono::{NaiveDateTime, SecondsFormat};
use contract::ErrorCode;
use contract::commerce::orders::{
    CreateOrderInput, CreateOrderLine, CreateOrderOutput, OrderAxis, OrderEvent, OrderItem,
    OrderTransition, OrderTransitions, RecordPaymentInput, RecordPaymentOutput, RejectedCoupon,
    TransitionOrderOutput,
};
use sqlx::PgPool;

use crate::commerce::wallet;
use crate::jobs::{self, OrderExpiry};
use crate::tenant::{TenantId, begin_scoped};

/// `Timestamp(3)` → RFC 3339 with milliseconds and a trailing `Z`, the shape the
/// Bun backend's `Date.toISOString()` produced.
fn to_iso(timestamp: NaiveDateTime) -> String {
    timestamp
        .and_utc()
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn optional_iso(timestamp: Option<NaiveDateTime>) -> Option<String> {
    timestamp.map(to_iso)
}

/// One `Order` row, with its coupon code resolved.
pub struct OrderRow {
    pub id: String,
    pub code: String,
    pub customer_id: String,
    pub subtotal_cents: i32,
    pub discount_cents: i32,
    pub shipping_cents: i32,
    pub wallet_applied_cents: i32,
    pub cashback_cents: i32,
    pub total_cents: i32,
    pub financial_status: String,
    pub fulfilment_status: String,
    pub payment_method: Option<String>,
    pub paid_at: Option<String>,
    pub expires_at: Option<String>,
    pub coupon_code: Option<String>,
}

/// The order behind a human code, in this tenant, or `None`. The coupon is
/// joined rather than fetched separately: `couponCode` is part of the page, and
/// the join also matches on the tenant.
pub async fn order_by_code(
    pool: &PgPool,
    tenant: &TenantId,
    code: &str,
) -> Result<Option<OrderRow>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT o.id, o.code, o."customerId" AS customer_id,
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
               c.code AS coupon_code
        FROM public."Order" o
        LEFT JOIN public."Coupon" c
            ON c."tenantId" = o."tenantId" AND c.id = o."couponId"
        WHERE o."tenantId" = $1 AND o.code = $2
        "#,
        tenant.as_str(),
        code,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| OrderRow {
        id: row.id,
        code: row.code,
        customer_id: row.customer_id,
        subtotal_cents: row.subtotal_cents,
        discount_cents: row.discount_cents,
        shipping_cents: row.shipping_cents,
        wallet_applied_cents: row.wallet_applied_cents,
        cashback_cents: row.cashback_cents,
        total_cents: row.total_cents,
        financial_status: row.financial_status,
        fulfilment_status: row.fulfilment_status,
        payment_method: row.payment_method,
        paid_at: optional_iso(row.paid_at),
        expires_at: optional_iso(row.expires_at),
        coupon_code: row.coupon_code,
    }))
}

/// One `OrderItem` row.
struct ItemRow {
    id: String,
    name: String,
    unit_price_cents: i32,
    quantity: i32,
    line_total_cents: i32,
    options_label: Option<String>,
}

/// The lines of an order, by name. The order page shows them in that order.
pub async fn items(
    pool: &PgPool,
    tenant: &TenantId,
    order_id: &str,
) -> Result<Vec<OrderItem>, sqlx::Error> {
    let rows = sqlx::query_as!(
        ItemRow,
        r#"
        SELECT id, name, "unitPriceCents" AS unit_price_cents, quantity,
               "lineTotalCents" AS line_total_cents,
               "optionsLabel" AS options_label
        FROM public."OrderItem"
        WHERE "tenantId" = $1 AND "orderId" = $2
        ORDER BY name ASC, id ASC
        "#,
        tenant.as_str(),
        order_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| OrderItem {
            id: row.id,
            name: row.name,
            unit_price_cents: row.unit_price_cents,
            quantity: row.quantity,
            line_total_cents: row.line_total_cents,
            options_label: row.options_label,
        })
        .collect())
}

/// One `OrderEvent` row.
struct EventRow {
    id: String,
    event_type: String,
    from_value: Option<String>,
    to_value: Option<String>,
    reason: Option<String>,
    created_at: NaiveDateTime,
}

/// The append-only trail of an order, oldest first.
pub async fn events(
    pool: &PgPool,
    tenant: &TenantId,
    order_id: &str,
) -> Result<Vec<OrderEvent>, sqlx::Error> {
    let rows = sqlx::query_as!(
        EventRow,
        r#"
        SELECT id, type AS event_type, "fromValue" AS from_value,
               "toValue" AS to_value, reason, "createdAt" AS created_at
        FROM public."OrderEvent"
        WHERE "tenantId" = $1 AND "orderId" = $2
        ORDER BY "createdAt" ASC, id ASC
        "#,
        tenant.as_str(),
        order_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| OrderEvent {
            id: row.id,
            event_type: row.event_type,
            from_value: row.from_value,
            to_value: row.to_value,
            reason: row.reason,
            created_at: to_iso(row.created_at),
        })
        .collect())
}

const WRITE: &str = "orders:write";

const REFUND: &str = "orders:refund";

/// One legal move: the tuple, the capability it takes and whether it must say
/// why. Ported verbatim from the Bun `TRANSITIONS` table, including the order.
struct Rule {
    axis: OrderAxis,
    from: &'static str,
    to: &'static str,
    capability: &'static str,
    requires_reason: bool,
}

/// The legal `(axis, from, to)` tuples. `paid` is the money landing, driven by
/// `recordPayment`; money already taken leaves through `refunded` only.
const TRANSITIONS: &[Rule] = &[
    // Financial.
    rule(
        OrderAxis::Financial,
        "pending",
        "awaiting_payment",
        WRITE,
        false,
    ),
    rule(
        OrderAxis::Financial,
        "pending",
        "pending_on_delivery",
        WRITE,
        false,
    ),
    rule(OrderAxis::Financial, "pending", "canceled", WRITE, true),
    rule(
        OrderAxis::Financial,
        "awaiting_payment",
        "paid",
        WRITE,
        false,
    ),
    rule(
        OrderAxis::Financial,
        "awaiting_payment",
        "expired",
        WRITE,
        false,
    ),
    rule(
        OrderAxis::Financial,
        "awaiting_payment",
        "canceled",
        WRITE,
        true,
    ),
    rule(
        OrderAxis::Financial,
        "pending_on_delivery",
        "paid",
        WRITE,
        false,
    ),
    rule(
        OrderAxis::Financial,
        "pending_on_delivery",
        "canceled",
        WRITE,
        true,
    ),
    rule(OrderAxis::Financial, "paid", "refunded", REFUND, true),
    // Fulfilment. A kitchen cancellation must say why.
    rule(OrderAxis::Fulfilment, "pending", "confirmed", WRITE, false),
    rule(
        OrderAxis::Fulfilment,
        "confirmed",
        "preparing",
        WRITE,
        false,
    ),
    rule(OrderAxis::Fulfilment, "preparing", "ready", WRITE, false),
    rule(
        OrderAxis::Fulfilment,
        "ready",
        "ready_for_pickup",
        WRITE,
        false,
    ),
    rule(
        OrderAxis::Fulfilment,
        "ready",
        "out_for_delivery",
        WRITE,
        false,
    ),
    rule(
        OrderAxis::Fulfilment,
        "ready_for_pickup",
        "completed",
        WRITE,
        false,
    ),
    rule(
        OrderAxis::Fulfilment,
        "out_for_delivery",
        "completed",
        WRITE,
        false,
    ),
    rule(OrderAxis::Fulfilment, "pending", "canceled", WRITE, true),
    rule(OrderAxis::Fulfilment, "confirmed", "canceled", WRITE, true),
    rule(OrderAxis::Fulfilment, "preparing", "canceled", WRITE, true),
    rule(OrderAxis::Fulfilment, "ready", "canceled", WRITE, true),
];

const fn rule(
    axis: OrderAxis,
    from: &'static str,
    to: &'static str,
    capability: &'static str,
    requires_reason: bool,
) -> Rule {
    Rule {
        axis,
        from,
        to,
        capability,
        requires_reason,
    }
}

/// Who is asking: the capabilities their role grants, and the member recorded
/// on the event trail.
#[derive(Debug, Clone, Copy)]
pub struct TransitionActor<'a> {
    pub capabilities: &'a [&'a str],
    pub member_id: Option<&'a str>,
}

/// Every legal move out of `from` on `axis` that `actor` may perform. Ordering
/// is the table's, so the dashboard shows the buttons in the same order.
pub fn next_transitions(axis: OrderAxis, from: &str, capabilities: &[&str]) -> OrderTransitions {
    OrderTransitions(
        TRANSITIONS
            .iter()
            .filter(|rule| {
                rule.axis == axis && rule.from == from && capabilities.contains(&rule.capability)
            })
            .map(|rule| OrderTransition {
                axis: rule.axis,
                to: rule.to.to_owned(),
                capability: rule.capability.to_owned(),
                requires_reason: rule.requires_reason,
            })
            .collect(),
    )
}

/// Why an order write was refused.
#[derive(Debug, thiserror::Error)]
pub enum OrderError {
    /// No such order in this tenant.
    #[error("order not found")]
    NotFound,
    /// The tuple is not a legal move from the current state.
    #[error("order transition {from} -> {to} is not allowed")]
    Invalid { from: String, to: String },
    /// The actor's role lacks the capability the rule requires.
    #[error("order transition forbidden")]
    Forbidden,
    /// The rule demands a reason and the caller sent none.
    #[error("order transition requires a reason")]
    ReasonRequired,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Move one axis of an order to `target` and append the event.
///
/// The row is locked before its state is read, so two transitions on the same
/// order serialize instead of both acting on the same `from`. An illegal tuple
/// is [`OrderError::Invalid`]; a missing capability is
/// [`OrderError::Forbidden`] and a missing required reason is
/// [`OrderError::ReasonRequired`] — permission is checked before the reason, so
/// a caller who may not perform the move cannot probe its requirements.
pub async fn transition(
    pool: &PgPool,
    tenant: &TenantId,
    code: &str,
    axis: OrderAxis,
    target: &str,
    reason: Option<&str>,
    actor: TransitionActor<'_>,
) -> Result<TransitionOrderOutput, OrderError> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let order = sqlx::query!(
        r#"
        SELECT id, "financialStatus" AS financial_status,
               "fulfilmentStatus" AS fulfilment_status
        FROM public."Order"
        WHERE "tenantId" = $1 AND code = $2
        FOR UPDATE
        "#,
        tenant.as_str(),
        code,
    )
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(OrderError::NotFound)?;

    let from = match axis {
        OrderAxis::Financial => order.financial_status.as_str(),
        OrderAxis::Fulfilment => order.fulfilment_status.as_str(),
    };

    let rule = TRANSITIONS
        .iter()
        .find(|rule| rule.axis == axis && rule.from == from && rule.to == target)
        .ok_or_else(|| OrderError::Invalid {
            from: from.to_owned(),
            to: target.to_owned(),
        })?;

    if !actor.capabilities.contains(&rule.capability) {
        return Err(OrderError::Forbidden);
    }

    if rule.requires_reason && reason.unwrap_or("").trim().is_empty() {
        return Err(OrderError::ReasonRequired);
    }

    let now = chrono::Utc::now().naive_utc();

    match axis {
        OrderAxis::Financial => {
            sqlx::query!(
                r#"
                UPDATE public."Order"
                SET "financialStatus" = $3, "updatedAt" = $4
                WHERE "tenantId" = $1 AND id = $2
                "#,
                tenant.as_str(),
                order.id,
                target,
                now,
            )
            .execute(&mut **tx)
            .await?;
        }
        OrderAxis::Fulfilment => {
            sqlx::query!(
                r#"
                UPDATE public."Order"
                SET "fulfilmentStatus" = $3, "updatedAt" = $4
                WHERE "tenantId" = $1 AND id = $2
                "#,
                tenant.as_str(),
                order.id,
                target,
                now,
            )
            .execute(&mut **tx)
            .await?;
        }
    }

    sqlx::query!(
        r#"
        INSERT INTO public."OrderEvent" (
            id, "tenantId", "orderId", type, "fromValue", "toValue",
            "actorMemberId", reason, "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
        uuid::Uuid::new_v4().to_string(),
        tenant.as_str(),
        order.id,
        match axis {
            OrderAxis::Financial => "financial_changed",
            OrderAxis::Fulfilment => "fulfilment_changed",
        },
        from,
        target,
        actor.member_id,
        reason,
        now,
    )
    .execute(&mut **tx)
    .await?;

    tx.commit().await?;

    Ok(TransitionOrderOutput {
        financial_status: match axis {
            OrderAxis::Financial => target.to_owned(),
            OrderAxis::Fulfilment => order.financial_status,
        },
        fulfilment_status: match axis {
            OrderAxis::Fulfilment => target.to_owned(),
            OrderAxis::Financial => order.fulfilment_status,
        },
    })
}

/// One wallet ledger row for the order being expired.
struct LedgerRow {
    kind: String,
    amount_cents: i32,
}

/// What is still held for the order: reserved minus released minus spent, never
/// negative. A spend settles the reserve of the same order.
fn outstanding_reserve(rows: &[LedgerRow]) -> i32 {
    let mut outstanding = 0_i32;

    for row in rows {
        match row.kind.as_str() {
            "reserve" => {
                outstanding = outstanding.saturating_add(row.amount_cents.saturating_neg())
            }
            "reserve_release" => outstanding = outstanding.saturating_add(row.amount_cents),
            "spend" => outstanding = outstanding.saturating_add(row.amount_cents.saturating_neg()),
            _ => {}
        }
    }

    outstanding.max(0)
}

/// Expire an unpaid order whose window has closed and give the wallet reserve
/// back.
///
/// Idempotent by order code: a second run on an already-expired order touches
/// nothing. Only an `awaiting_payment` order with an `expiresAt` in the past
/// expires; an order paid in the meantime keeps its money. The outstanding
/// reserve for the order becomes a `reserve_release` and the stored balance rolls
/// forward by the same amount — never more than is still reserved, so a
/// cancel + refund pair cannot mint credit.
pub async fn expire(pool: &PgPool, tenant: &TenantId, code: &str) -> Result<String, OrderError> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let order = sqlx::query!(
        r#"
        SELECT id, code, "customerId" AS customer_id,
               "financialStatus" AS financial_status,
               "walletAppliedCents" AS wallet_applied_cents,
               "expiresAt" AS expires_at
        FROM public."Order"
        WHERE "tenantId" = $1 AND code = $2
        FOR UPDATE
        "#,
        tenant.as_str(),
        code,
    )
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(OrderError::NotFound)?;

    let now = chrono::Utc::now().naive_utc();

    // No `expiresAt` means no window was ever opened for this order — a method
    // bound to an `offline` integration, reconciled by the store itself. A
    // window still open keeps the money where it is.
    let Some(expires_at) = order.expires_at else {
        return Ok(order.financial_status);
    };

    if order.financial_status != "awaiting_payment" || expires_at > now {
        return Ok(order.financial_status);
    }

    sqlx::query!(
        r#"
        UPDATE public."Order"
        SET "financialStatus" = 'expired', "updatedAt" = $3
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        order.id,
        now,
    )
    .execute(&mut **tx)
    .await?;

    sqlx::query!(
        r#"
        INSERT INTO public."OrderEvent" (
            id, "tenantId", "orderId", type, "fromValue", "toValue", "createdAt"
        )
        VALUES ($1, $2, $3, 'financial_changed', $4, 'expired', $5)
        "#,
        uuid::Uuid::new_v4().to_string(),
        tenant.as_str(),
        order.id,
        order.financial_status,
        now,
    )
    .execute(&mut **tx)
    .await?;

    if order.wallet_applied_cents > 0 {
        // The wallet row is locked first, so the release reads the balance the
        // other movement left behind and not the one it raced with.
        let wallet = sqlx::query!(
            r#"
            SELECT id
            FROM public."Wallet"
            WHERE "tenantId" = $1 AND "customerId" = $2
            FOR UPDATE
            "#,
            tenant.as_str(),
            order.customer_id,
        )
        .fetch_optional(&mut **tx)
        .await?;

        if let Some(wallet) = wallet {
            let ledger = sqlx::query_as!(
                LedgerRow,
                r#"
                SELECT kind, "amountCents" AS amount_cents
                FROM public."WalletTransaction"
                WHERE "tenantId" = $1 AND "walletId" = $2 AND "orderId" = $3
                "#,
                tenant.as_str(),
                wallet.id,
                order.id,
            )
            .fetch_all(&mut **tx)
            .await?;

            let amount_cents = order.wallet_applied_cents;

            // Nothing left to release (already spent or released): the order
            // still expires, there is just no money to give back.
            if amount_cents <= outstanding_reserve(&ledger) {
                sqlx::query!(
                    r#"
                    INSERT INTO public."WalletTransaction" (
                        id, "tenantId", "walletId", "orderId", kind, "amountCents",
                        reason, "createdAt"
                    )
                    VALUES ($1, $2, $3, $4, 'reserve_release', $5, $6, $7)
                    "#,
                    uuid::Uuid::new_v4().to_string(),
                    tenant.as_str(),
                    wallet.id,
                    order.id,
                    amount_cents,
                    format!("Reserva liberada no pedido {}", order.code),
                    now,
                )
                .execute(&mut **tx)
                .await?;

                sqlx::query!(
                    r#"
                    UPDATE public."Wallet"
                    SET "balanceCents" = "balanceCents" + $3, "updatedAt" = $4
                    WHERE "tenantId" = $1 AND id = $2
                    "#,
                    tenant.as_str(),
                    wallet.id,
                    amount_cents,
                    now,
                )
                .execute(&mut **tx)
                .await?;

                sqlx::query!(
                    r#"
                    INSERT INTO public."OrderEvent" (
                        id, "tenantId", "orderId", type, "fromValue", "toValue",
                        "createdAt"
                    )
                    VALUES ($1, $2, $3, 'wallet_released', NULL, $4, $5)
                    "#,
                    uuid::Uuid::new_v4().to_string(),
                    tenant.as_str(),
                    order.id,
                    amount_cents.to_string(),
                    now,
                )
                .execute(&mut **tx)
                .await?;
            }
        }
    }

    tx.commit().await?;

    Ok("expired".to_owned())
}

/// Why a checkout was refused.
#[derive(Debug, thiserror::Error)]
pub enum CreateOrderError {
    /// No such customer in this tenant.
    #[error("order customer not found")]
    NotFound,
    /// The input, the catalog, a coupon limit or a stock count refused the
    /// write. The code is the wire code the Bun backend surfaced.
    #[error("order create refused: {0:?}")]
    Validation(ErrorCode),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    /// The expiry job could not be inserted, so the checkout rolls back rather
    /// than committing an order nothing will ever expire.
    #[error(transparent)]
    Queue(#[from] riverqueue::Error),
}

/// Base32-ish alphabet without `0/O/1/I`: the code is read aloud and typed by
/// hand.
const CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/// A generated six-character order code. `Uuid::new_v4()` is the entropy source
/// already in the workspace; nothing here needs a random-number crate.
fn generate_code() -> String {
    let id = uuid::Uuid::new_v4();

    id.as_bytes()
        .iter()
        .take(6)
        .map(|byte| char::from(CODE_ALPHABET[usize::from(*byte % 32)]))
        .collect()
}

/// One `Coupon` row with the caller's counters and product scope folded in, the
/// narrow slice the pricing engine reads.
struct Coupon {
    id: String,
    code: String,
    discount_type: String,
    value: i32,
    minimum_order_cents: Option<i32>,
    maximum_discount_cents: Option<i32>,
    shipping_discount_percent: Option<i32>,
    starts_at: Option<NaiveDateTime>,
    ends_at: Option<NaiveDateTime>,
    stackable: bool,
    first_purchase_only: bool,
    usage_limit: Option<i32>,
    per_customer_limit: Option<i32>,
    usage_count: i32,
    customer_redemption_count: i64,
    customer_order_count: i64,
    status: String,
    product_scope_mode: String,
    product_ids: Vec<String>,
}

/// One checkout line after the catalog priced it.
struct PricedLine<'a> {
    line: &'a CreateOrderLine,
    /// The variation's price when the line names one, the quoted price
    /// otherwise.
    unit_price_cents: i32,
    gross_cents: i32,
}

/// The pricing engine's answer, plus the coupons that actually applied.
struct Price {
    subtotal_cents: i32,
    discount_cents: i32,
    shipping_cents: i32,
    wallet_applied_cents: i32,
    cashback_cents: i32,
    total_cents: i32,
    /// The first coupon that took money off the order, in discount order.
    coupon_id: Option<String>,
    /// One entry per applied coupon discount, folded per coupon when redeemed.
    applied_coupons: Vec<(String, i32)>,
    rejected_coupons: Vec<RejectedCoupon>,
}

/// Checkout: price the cart, take the stock and write the order in one tenant
/// transaction.
///
/// The money is never re-derived by the caller: this port of `createOrder` and
/// `priceOrder` is the only place that decides cents. Stock is taken before the
/// order row under a row lock, so two checkouts cannot take the same last unit;
/// a coupon that lost its limit race rolls the whole transaction back as
/// `CONFLICT`, exactly as the Bun redemption uniques did.
pub async fn create(
    pool: &PgPool,
    river: &riverqueue::Client,
    tenant: &TenantId,
    input: &CreateOrderInput,
) -> Result<CreateOrderOutput, CreateOrderError> {
    input.validate().map_err(CreateOrderError::Validation)?;

    let mut tx = begin_scoped(pool, tenant).await?;

    let customer = sqlx::query!(
        r#"
        SELECT id
        FROM public."Customer"
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        input.customer_id,
    )
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(CreateOrderError::NotFound)?;

    let wallet = sqlx::query!(
        r#"
        SELECT id, "balanceCents" AS balance_cents
        FROM public."Wallet"
        WHERE "tenantId" = $1 AND "customerId" = $2
        "#,
        tenant.as_str(),
        customer.id,
    )
    .fetch_optional(&mut **tx)
    .await?;

    // An unknown or inactive code is not an error: `priceOrder` never sees the
    // row, so checkout simply does not report it.
    let mut coupons = Vec::new();

    for raw in &input.coupon_codes {
        let code = raw.trim().to_uppercase();

        let Some(coupon) = sqlx::query_as!(
            Coupon,
            r#"
            SELECT c.id, c.code, c."discountType" AS discount_type, c.value,
                   c."minimumOrderCents" AS minimum_order_cents,
                   c."maximumDiscountCents" AS maximum_discount_cents,
                   c."shippingDiscountPercent" AS shipping_discount_percent,
                   c."startsAt" AS starts_at, c."endsAt" AS ends_at,
                   c.stackable, c."firstPurchaseOnly" AS first_purchase_only,
                   c."usageLimit" AS usage_limit,
                   c."perCustomerLimit" AS per_customer_limit,
                   c."usageCount" AS usage_count, c.status,
                   c."productScopeMode" AS product_scope_mode,
                   (
                       SELECT COUNT(*)
                       FROM public."CouponRedemption" r
                       WHERE r."tenantId" = c."tenantId"
                         AND r."couponId" = c.id
                         AND r."customerId" = $3
                   ) AS "customer_redemption_count!",
                   (
                       SELECT COUNT(*)
                       FROM public."Order" o
                       WHERE o."tenantId" = c."tenantId"
                         AND o."customerId" = $3
                   ) AS "customer_order_count!",
                   ARRAY(
                       SELECT cp."productId"
                       FROM public."CouponProduct" cp
                       WHERE cp."tenantId" = c."tenantId" AND cp."couponId" = c.id
                   ) AS "product_ids!"
            FROM public."Coupon" c
            WHERE c."tenantId" = $1 AND c.code = $2 AND c.status = 'active'
            "#,
            tenant.as_str(),
            code,
            customer.id,
        )
        .fetch_optional(&mut **tx)
        .await?
        else {
            continue;
        };

        coupons.push(coupon);
    }

    let mut priced_lines = Vec::with_capacity(input.lines.len());

    for line in &input.lines {
        let unit_price_cents = resolve_line_price(&mut tx, tenant, line).await?;
        let gross_cents = unit_price_cents * line.quantity;

        priced_lines.push(PricedLine {
            line,
            unit_price_cents,
            gross_cents,
        });
    }

    let payment_mode = match &input.payment_method {
        None => "gateway",
        Some(method) => resolve_payment_mode(&mut tx, tenant, method).await?,
    };

    let now = chrono::Utc::now().naive_utc();

    let wallet_available_cents = wallet.as_ref().map_or(0, |wallet| wallet.balance_cents);

    let priced = price(
        &priced_lines,
        &coupons,
        input.shipping_cents,
        input.wallet_requested_cents,
        wallet_available_cents,
        // `createOrder` passes no cashback percentage at checkout.
        0,
        now,
    );

    let financial_status = match input.payment_method.as_deref() {
        None => "pending",
        Some("cash_on_delivery" | "card_on_delivery") => "pending_on_delivery",
        Some(_) => "awaiting_payment",
    };

    // A manual (offline) integration has no online instrument to expire: the
    // order waits for the store to reconcile it, so it gets no payment window.
    let expires_at = if financial_status == "awaiting_payment" && payment_mode != "manual" {
        Some(now + chrono::Duration::hours(24))
    } else {
        None
    };

    let order_id = uuid::Uuid::new_v4().to_string();

    let mut events: Vec<(&str, Option<String>, Option<String>)> = vec![
        ("financial_changed", None, Some(financial_status.to_owned())),
        ("fulfilment_changed", None, Some("pending".to_owned())),
    ];

    if priced.wallet_applied_cents > 0 {
        events.push(("wallet_reserved", None, None));
    }

    // The stock is taken before the order is written, under a row lock, so two
    // checkouts cannot take the same last unit. A variation that ran out is a
    // conflict: the buyer sees the fresh availability.
    reserve_stock(&mut tx, tenant, &input.lines).await?;

    let requested_code = input.code.as_deref();
    let attempts = if requested_code.is_some() { 1 } else { 5 };
    let mut code = String::new();
    let mut inserted = false;

    // `ON CONFLICT DO NOTHING` lets a generated code retry inside the one
    // transaction; a requested code that clashes is the caller's mistake.
    for _ in 0..attempts {
        code = match requested_code {
            Some(requested) => requested.to_owned(),
            None => generate_code(),
        };

        let result = sqlx::query!(
            r#"
            INSERT INTO public."Order" (
                id, "tenantId", code, "customerId", "subtotalCents", "discountCents",
                "shippingCents", "walletAppliedCents", "cashbackCents", "totalCents",
                "financialStatus", "fulfilmentStatus", "paymentMethod", "expiresAt",
                "couponId", "createdAt", "updatedAt"
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17
            )
            ON CONFLICT ("tenantId", code) DO NOTHING
            "#,
            order_id.as_str(),
            tenant.as_str(),
            code.as_str(),
            customer.id,
            priced.subtotal_cents,
            priced.discount_cents,
            priced.shipping_cents,
            priced.wallet_applied_cents,
            priced.cashback_cents,
            priced.total_cents,
            financial_status,
            "pending",
            input.payment_method.as_deref(),
            expires_at,
            priced.coupon_id.as_deref(),
            now,
            now,
        )
        .execute(&mut **tx)
        .await?;

        if result.rows_affected() == 1 {
            inserted = true;
            break;
        }
    }

    if !inserted {
        return Err(CreateOrderError::Validation(ErrorCode::Conflict));
    }

    for line in &priced_lines {
        sqlx::query!(
            r#"
            INSERT INTO public."OrderItem" (
                id, "tenantId", "orderId", "productId", "variationId", "kitId",
                name, "unitPriceCents", quantity, "lineTotalCents"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            "#,
            uuid::Uuid::new_v4().to_string(),
            tenant.as_str(),
            order_id.as_str(),
            line.line.product_id.as_deref(),
            line.line.variation_id.as_deref(),
            line.line.kit_id.as_deref(),
            line.line.name.as_str(),
            line.unit_price_cents,
            line.line.quantity,
            line.gross_cents,
        )
        .execute(&mut **tx)
        .await?;
    }

    for (event_type, from_value, to_value) in &events {
        sqlx::query!(
            r#"
            INSERT INTO public."OrderEvent" (
                id, "tenantId", "orderId", type, "fromValue", "toValue",
                "actorMemberId", reason, "createdAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7)
            "#,
            uuid::Uuid::new_v4().to_string(),
            tenant.as_str(),
            order_id.as_str(),
            *event_type,
            from_value.as_deref(),
            to_value.as_deref(),
            now,
        )
        .execute(&mut **tx)
        .await?;
    }

    apply_coupon_redemptions(
        &mut tx,
        tenant,
        order_id.as_str(),
        customer.id.as_str(),
        &priced.applied_coupons,
    )
    .await?;

    if priced.wallet_applied_cents > 0 {
        let wallet = wallet.ok_or(CreateOrderError::Validation(ErrorCode::Conflict))?;

        let locked = sqlx::query!(
            r#"
            SELECT id, "balanceCents" AS balance_cents
            FROM public."Wallet"
            WHERE "tenantId" = $1 AND id = $2
            FOR UPDATE
            "#,
            tenant.as_str(),
            wallet.id,
        )
        .fetch_optional(&mut **tx)
        .await?
        .ok_or(CreateOrderError::Validation(ErrorCode::Conflict))?;

        // `priceOrder` already clamped the request to what was available, so a
        // refusal here is a concurrent spend and the order cannot be created.
        let balance_cents = locked.balance_cents - priced.wallet_applied_cents;

        if balance_cents < 0 {
            return Err(CreateOrderError::Validation(ErrorCode::Conflict));
        }

        sqlx::query!(
            r#"
            INSERT INTO public."WalletTransaction" (
                id, "tenantId", "walletId", "orderId", kind, "amountCents",
                reason, "createdAt"
            )
            VALUES ($1, $2, $3, $4, 'reserve', $5, $6, $7)
            "#,
            uuid::Uuid::new_v4().to_string(),
            tenant.as_str(),
            locked.id,
            order_id.as_str(),
            -priced.wallet_applied_cents,
            format!("Reserva aplicada no pedido {code}"),
            now,
        )
        .execute(&mut **tx)
        .await?;

        sqlx::query!(
            r#"
            UPDATE public."Wallet"
            SET "balanceCents" = $3, "updatedAt" = $4
            WHERE "tenantId" = $1 AND id = $2
            "#,
            tenant.as_str(),
            locked.id,
            balance_cents,
            now,
        )
        .execute(&mut **tx)
        .await?;
    }

    // The payment window's deadline rides in the same transaction: a committed
    // order is always one River will try to expire (ADR-0008).
    if let Some(deadline) = expires_at {
        river
            .insert(OrderExpiry {
                tenant_id: tenant.as_str().to_owned(),
                order_code: code.clone(),
            })
            .opts(jobs::insert_opts(jobs::ORDERS_EXPIRY).with_scheduled_at(deadline.and_utc()))
            .tx(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(CreateOrderOutput {
        id: order_id,
        code,
        subtotal_cents: priced.subtotal_cents,
        discount_cents: priced.discount_cents,
        shipping_cents: priced.shipping_cents,
        wallet_applied_cents: priced.wallet_applied_cents,
        cashback_cents: priced.cashback_cents,
        total_cents: priced.total_cents,
        financial_status: financial_status.to_owned(),
        fulfilment_status: "pending".to_owned(),
        expires_at: optional_iso(expires_at),
        rejected_coupons: priced.rejected_coupons,
    })
}

/// The line's server price and the catalog ownership checks `catalog.ts` makes:
/// a line that names another store's product, variation or kit is invalid, and a
/// variation of another product is not this line's variation.
async fn resolve_line_price(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    line: &CreateOrderLine,
) -> Result<i32, CreateOrderError> {
    if let Some(product_id) = &line.product_id {
        let owned = sqlx::query!(
            r#"SELECT id FROM public."Product" WHERE "tenantId" = $1 AND id = $2"#,
            tenant.as_str(),
            product_id,
        )
        .fetch_optional(&mut *tx)
        .await?
        .is_some();

        if !owned {
            return Err(CreateOrderError::Validation(ErrorCode::ValidationFailed));
        }
    }

    let mut price = line.unit_price_cents;

    if let Some(variation_id) = &line.variation_id {
        let variation = sqlx::query!(
            r#"
            SELECT "productId" AS product_id, "priceCents" AS price_cents
            FROM public."Variation"
            WHERE "tenantId" = $1 AND id = $2
            "#,
            tenant.as_str(),
            variation_id,
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(CreateOrderError::Validation(ErrorCode::ValidationFailed))?;

        if line
            .product_id
            .as_ref()
            .is_some_and(|product_id| &variation.product_id != product_id)
        {
            return Err(CreateOrderError::Validation(ErrorCode::ValidationFailed));
        }

        price = variation.price_cents;
    }

    if let Some(kit_id) = &line.kit_id {
        let owned = sqlx::query!(
            r#"SELECT id FROM public."Kit" WHERE "tenantId" = $1 AND id = $2"#,
            tenant.as_str(),
            kit_id,
        )
        .fetch_optional(&mut *tx)
        .await?
        .is_some();

        if !owned {
            return Err(CreateOrderError::Validation(ErrorCode::ValidationFailed));
        }
    }

    Ok(price)
}

/// Which side closes the payment. A method bound to an `offline` integration is
/// reconciled by the store itself, so `createOrder` gives it no expiry window; a
/// method nobody configured yet keeps the gateway window.
async fn resolve_payment_mode(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    method: &str,
) -> Result<&'static str, sqlx::Error> {
    let assignment = sqlx::query!(
        r#"
        SELECT "integrationId" AS integration_id
        FROM public."PaymentMethodAssignment"
        WHERE "tenantId" = $1 AND method = $2
        "#,
        tenant.as_str(),
        method,
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(assignment) = assignment else {
        return Ok("gateway");
    };

    let provider = sqlx::query!(
        r#"
        SELECT provider
        FROM public."PaymentIntegration"
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        assignment.integration_id,
    )
    .fetch_optional(&mut *tx)
    .await?
    .map(|integration| integration.provider);

    if provider.as_deref() == Some("offline") {
        Ok("manual")
    } else {
        Ok("gateway")
    }
}

/// Takes the stock of every line, expanding kits into their variations. The
/// whole set is taken or none of it is: a variation that cannot be satisfied
/// leaves the transaction to roll back, so a half-taken order never exists.
async fn reserve_stock(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    lines: &[CreateOrderLine],
) -> Result<(), CreateOrderError> {
    let mut totals: std::collections::HashMap<String, i32> = std::collections::HashMap::new();

    for line in lines {
        if let Some(variation_id) = &line.variation_id {
            *totals.entry(variation_id.clone()).or_default() += line.quantity;
        }

        if let Some(kit_id) = &line.kit_id {
            let items = sqlx::query!(
                r#"
                SELECT "variationId" AS variation_id, quantity
                FROM public."KitItem"
                WHERE "tenantId" = $1 AND "kitId" = $2
                "#,
                tenant.as_str(),
                kit_id,
            )
            .fetch_all(&mut *tx)
            .await?;

            for item in items {
                *totals.entry(item.variation_id).or_default() += item.quantity * line.quantity;
            }
        }
    }

    // A stable order keeps two concurrent checkouts from locking the same rows
    // in opposite directions.
    let mut variation_ids: Vec<String> = totals.keys().cloned().collect();
    variation_ids.sort();

    for variation_id in variation_ids {
        let quantity = totals[&variation_id];

        let variation = sqlx::query!(
            r#"
            SELECT "stockMode" AS stock_mode, "stockQty" AS stock_qty
            FROM public."Variation"
            WHERE "tenantId" = $1 AND id = $2
            FOR UPDATE
            "#,
            tenant.as_str(),
            variation_id.as_str(),
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(CreateOrderError::Validation(ErrorCode::Conflict))?;

        // An unlimited variation has no quantity to take.
        if variation.stock_mode == "unlimited" {
            continue;
        }

        let available = variation.stock_qty.unwrap_or(0);

        if available < quantity {
            return Err(CreateOrderError::Validation(ErrorCode::Conflict));
        }

        sqlx::query!(
            r#"
            UPDATE public."Variation"
            SET "stockQty" = $3
            WHERE "tenantId" = $1 AND id = $2
            "#,
            tenant.as_str(),
            variation_id.as_str(),
            available - quantity,
        )
        .execute(&mut *tx)
        .await?;
    }

    Ok(())
}

/// Records one redemption per coupon used and counts each coupon up once.
///
/// One coupon can contribute twice to the discount list — merchandise and
/// shipping — and a redemption per entry would collide on
/// `@@unique([couponId, orderId])`, so the entries are folded first. Both limits
/// are re-read under the coupon row lock: the price was computed from a snapshot
/// taken before this transaction.
async fn apply_coupon_redemptions(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    order_id: &str,
    customer_id: &str,
    applied: &[(String, i32)],
) -> Result<(), CreateOrderError> {
    let mut per_coupon: Vec<(String, i32)> = Vec::new();

    for (coupon_id, amount_cents) in applied {
        match per_coupon.iter_mut().find(|(id, _)| id == coupon_id) {
            Some((_, total)) => *total += amount_cents,
            None => per_coupon.push((coupon_id.clone(), *amount_cents)),
        }
    }

    for (coupon_id, discount_cents) in per_coupon {
        let coupon = sqlx::query!(
            r#"
            SELECT "usageCount" AS usage_count, "usageLimit" AS usage_limit,
                   "perCustomerLimit" AS per_customer_limit,
                   "firstPurchaseOnly" AS first_purchase_only
            FROM public."Coupon"
            WHERE "tenantId" = $1 AND id = $2 AND "deletedAt" IS NULL
            FOR UPDATE
            "#,
            tenant.as_str(),
            coupon_id.as_str(),
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(CreateOrderError::Validation(ErrorCode::Conflict))?;

        if coupon
            .usage_limit
            .is_some_and(|limit| coupon.usage_count >= limit)
        {
            return Err(CreateOrderError::Validation(ErrorCode::Conflict));
        }

        if let Some(limit) = coupon.per_customer_limit {
            let redemptions = sqlx::query!(
                r#"
                SELECT COUNT(*) AS "count!"
                FROM public."CouponRedemption"
                WHERE "tenantId" = $1 AND "couponId" = $2 AND "customerId" = $3
                "#,
                tenant.as_str(),
                coupon_id.as_str(),
                customer_id,
            )
            .fetch_one(&mut *tx)
            .await?
            .count;

            if redemptions >= i64::from(limit) {
                return Err(CreateOrderError::Validation(ErrorCode::Conflict));
            }
        }

        // The order row is already written here, so a first purchase counts one
        // and any earlier purchase makes it two.
        if coupon.first_purchase_only {
            let orders = sqlx::query!(
                r#"
                SELECT COUNT(*) AS "count!"
                FROM public."Order"
                WHERE "tenantId" = $1 AND "customerId" = $2
                "#,
                tenant.as_str(),
                customer_id,
            )
            .fetch_one(&mut *tx)
            .await?
            .count;

            if orders > 1 {
                return Err(CreateOrderError::Validation(ErrorCode::Conflict));
            }
        }

        sqlx::query!(
            r#"
            INSERT INTO public."CouponRedemption" (
                id, "tenantId", "couponId", "orderId", "customerId", "discountCents"
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            "#,
            uuid::Uuid::new_v4().to_string(),
            tenant.as_str(),
            coupon_id.as_str(),
            order_id,
            customer_id,
            discount_cents,
        )
        .execute(&mut *tx)
        .await?;

        sqlx::query!(
            r#"
            UPDATE public."Coupon"
            SET "usageCount" = $3
            WHERE "tenantId" = $1 AND id = $2
            "#,
            tenant.as_str(),
            coupon_id.as_str(),
            coupon.usage_count + 1,
        )
        .execute(&mut *tx)
        .await?;
    }

    Ok(())
}

/// Port of `priceOrder`. Integer cents only: every percentage is a truncating
/// division on non-negative values, so it floors, and no float exists to round.
fn price(
    lines: &[PricedLine<'_>],
    coupons: &[Coupon],
    shipping_cents: i32,
    wallet_requested_cents: i32,
    wallet_available_cents: i32,
    cashback_percent: i32,
    now: NaiveDateTime,
) -> Price {
    let mut subtotal_cents = 0_i32;
    let mut discount_cents = 0_i32;

    for line in lines {
        // Stale catalog data clamps instead of failing: a line never discounts
        // below zero and the order still prices.
        discount_cents += line
            .line
            .catalog_discount_cents
            .unwrap_or(0)
            .min(line.gross_cents);
        subtotal_cents += line.gross_cents;
    }

    let mut applicable: Vec<(usize, i32)> = Vec::new();
    let mut rejected_coupons = Vec::new();

    for (index, coupon) in coupons.iter().enumerate() {
        if let Some(reason) = ineligibility(coupon, subtotal_cents, now) {
            rejected_coupons.push(RejectedCoupon {
                code: coupon.code.clone(),
                reason: reason.to_owned(),
            });
            continue;
        }

        match scoped_subtotal(coupon, lines) {
            Some(eligible_subtotal_cents) => applicable.push((index, eligible_subtotal_cents)),
            None => rejected_coupons.push(RejectedCoupon {
                code: coupon.code.clone(),
                reason: "product_scope".to_owned(),
            }),
        }
    }

    // Provisional precedence (MEN-98): stackable coupons win, a non-stackable
    // one only ever applies when it is the only applicable coupon.
    if applicable.len() > 1 {
        for (index, _) in &applicable {
            let coupon = &coupons[*index];

            if !coupon.stackable {
                rejected_coupons.push(RejectedCoupon {
                    code: coupon.code.clone(),
                    reason: "not_stackable".to_owned(),
                });
            }
        }
    }

    let applying: Vec<(usize, i32)> = if applicable.len() > 1 {
        applicable
            .iter()
            .copied()
            .filter(|(index, _)| coupons[*index].stackable)
            .collect()
    } else {
        applicable
    };

    let quoted_shipping_cents = shipping_cents;
    let mut shipping_cents = shipping_cents;
    let mut coupon_id: Option<String> = None;
    let mut applied_coupons: Vec<(String, i32)> = Vec::new();

    for (index, eligible_subtotal_cents) in applying {
        let coupon = &coupons[index];

        let raw = if coupon.discount_type == "percentage" {
            let basis = i64::from(eligible_subtotal_cents) * i64::from(coupon.value);

            i32::try_from(basis / 100).unwrap_or(i32::MAX)
        } else {
            coupon.value.min(eligible_subtotal_cents)
        };

        let capped = match coupon.maximum_discount_cents {
            Some(maximum) => raw.min(maximum),
            None => raw,
        };

        let amount_cents = capped.max(0).min((subtotal_cents - discount_cents).max(0));

        if amount_cents > 0 {
            discount_cents += amount_cents;
            coupon_id.get_or_insert_with(|| coupon.id.clone());
            applied_coupons.push((coupon.id.clone(), amount_cents));
        }

        if let Some(percent) = coupon.shipping_discount_percent {
            // Percentage of the fee as quoted, clamped by whatever freight is
            // left, so stacking two shipping coupons cannot discount past zero.
            let basis = i64::from(quoted_shipping_cents) * i64::from(percent);

            let shipping_discount = i32::try_from(basis / 100)
                .unwrap_or(i32::MAX)
                .min(shipping_cents);

            if shipping_discount > 0 {
                shipping_cents -= shipping_discount;
                coupon_id.get_or_insert_with(|| coupon.id.clone());
                applied_coupons.push((coupon.id.clone(), shipping_discount));
            }
        }
    }

    let payable = subtotal_cents - discount_cents + shipping_cents;

    let wallet_applied_cents = wallet_requested_cents
        .min(wallet_available_cents)
        .min(payable)
        .max(0);

    let total_cents = (payable - wallet_applied_cents).max(0);

    // Net merchandise only, before freight and before wallet.
    let net_merchandise = (subtotal_cents - discount_cents).max(0);
    let cashback_cents = net_merchandise * cashback_percent / 100;

    Price {
        subtotal_cents,
        discount_cents,
        shipping_cents,
        wallet_applied_cents,
        cashback_cents,
        total_cents,
        coupon_id,
        applied_coupons,
        rejected_coupons,
    }
}

/// Why a coupon cannot apply, in the order `priceOrder` checks. `None` means it
/// may apply.
fn ineligibility(coupon: &Coupon, subtotal_cents: i32, now: NaiveDateTime) -> Option<&'static str> {
    if coupon.status != "active" {
        return Some("inactive");
    }

    if coupon.starts_at.is_some_and(|starts_at| now < starts_at) {
        return Some("not_started");
    }

    if coupon.ends_at.is_some_and(|ends_at| now > ends_at) {
        return Some("expired");
    }

    if coupon
        .usage_limit
        .is_some_and(|limit| coupon.usage_count >= limit)
    {
        return Some("usage_limit");
    }

    if coupon
        .per_customer_limit
        .is_some_and(|limit| coupon.customer_redemption_count >= i64::from(limit))
    {
        return Some("per_customer_limit");
    }

    if coupon.first_purchase_only && coupon.customer_order_count > 0 {
        return Some("not_first_purchase");
    }

    if coupon
        .minimum_order_cents
        .is_some_and(|minimum| subtotal_cents < minimum)
    {
        return Some("below_minimum");
    }

    None
}

/// Gross subtotal the coupon may discount, or `None` when its product scope
/// matches no line at all. An empty scope is "every product" in both modes.
fn scoped_subtotal(coupon: &Coupon, lines: &[PricedLine<'_>]) -> Option<i32> {
    if coupon.product_ids.is_empty() {
        return Some(lines.iter().map(|line| line.gross_cents).sum());
    }

    let include = coupon.product_scope_mode != "exclude";

    let mut subtotal_cents = 0_i32;
    let mut matched_lines = 0_usize;

    for line in lines {
        // A line without a product id is never listed: out of an `include`
        // scope, and not blocked by an `exclude` one.
        let listed = line
            .line
            .product_id
            .as_ref()
            .is_some_and(|product_id| coupon.product_ids.contains(product_id));

        if listed == include {
            subtotal_cents += line.gross_cents;
            matched_lines += 1;
        }
    }

    if matched_lines == 0 {
        None
    } else {
        Some(subtotal_cents)
    }
}

/// The columns of an order the paid transition reads. The caller locks the row
/// first, so the state read here cannot move underneath the write.
pub(crate) struct PaidOrder {
    pub id: String,
    pub code: String,
    pub customer_id: String,
    pub cashback_cents: i32,
    pub financial_status: String,
}

/// `POST /orders/{code}/payment`: the money landed, recorded by the store.
///
/// The order row is locked for the whole transaction. An order that is already
/// paid is answered from the row and touched no further. Otherwise the cashback
/// is credited once — the `cashback_credited` event is the receipt that it
/// already happened — and the `payment_recorded` event appends the move. A
/// retried member action and a replayed gateway callback both land here and
/// neither can credit the wallet twice (MEN-92, MEN-95).
pub async fn record_payment(
    pool: &PgPool,
    tenant: &TenantId,
    code: &str,
    input: &RecordPaymentInput,
    actor: Option<&str>,
) -> Result<RecordPaymentOutput, OrderError> {
    // The path carries the code; the body repeats it in the Bun contract. A
    // blank body falls back to the path instead of losing the order.
    let code = if input.code.trim().is_empty() {
        code
    } else {
        input.code.as_str()
    };

    let mut tx = begin_scoped(pool, tenant).await?;

    let order = sqlx::query!(
        r#"
        SELECT id, code, "customerId" AS customer_id,
               "cashbackCents" AS cashback_cents,
               "financialStatus" AS financial_status
        FROM public."Order"
        WHERE "tenantId" = $1 AND code = $2
        FOR UPDATE
        "#,
        tenant.as_str(),
        code,
    )
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(OrderError::NotFound)?;

    let order = PaidOrder {
        id: order.id,
        code: order.code,
        customer_id: order.customer_id,
        cashback_cents: order.cashback_cents,
        financial_status: order.financial_status,
    };

    mark_paid(&mut tx, tenant, &order, actor, None).await?;

    tx.commit().await?;

    Ok(RecordPaymentOutput {
        financial_status: "paid".to_owned(),
        cashback_cents: order.cashback_cents,
    })
}

/// The one place an order becomes paid: stamps the financial axis, credits the
/// cashback once and appends the two events.
///
/// The caller holds the order row lock. Idempotent by construction: an already
/// paid order is a no-op, and an existing `cashback_credited` receipt stops the
/// credit without touching the order — the same early return the Bun
/// `markOrderPaid` makes, so a replay cannot mint cashback twice.
pub(crate) async fn mark_paid(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    order: &PaidOrder,
    actor_member_id: Option<&str>,
    reason: Option<&str>,
) -> Result<(), sqlx::Error> {
    if order.financial_status == "paid" {
        return Ok(());
    }

    let receipt = sqlx::query!(
        r#"
        SELECT id
        FROM public."OrderEvent"
        WHERE "tenantId" = $1 AND "orderId" = $2 AND type = 'cashback_credited'
        LIMIT 1
        "#,
        tenant.as_str(),
        order.id,
    )
    .fetch_optional(&mut *tx)
    .await?;

    if receipt.is_some() {
        return Ok(());
    }

    let credited = wallet::credit_cashback(
        tx,
        tenant,
        &order.customer_id,
        &order.id,
        &order.code,
        order.cashback_cents,
        actor_member_id,
    )
    .await?;

    let now = chrono::Utc::now().naive_utc();

    if credited {
        sqlx::query!(
            r#"
            INSERT INTO public."OrderEvent" (
                id, "tenantId", "orderId", type, "fromValue", "toValue",
                "actorMemberId", reason, "createdAt"
            )
            VALUES ($1, $2, $3, 'cashback_credited', NULL, $4, $5, NULL, $6)
            "#,
            uuid::Uuid::new_v4().to_string(),
            tenant.as_str(),
            order.id,
            order.cashback_cents.to_string(),
            actor_member_id,
            now,
        )
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query!(
        r#"
        UPDATE public."Order"
        SET "financialStatus" = 'paid', "paidAt" = $3, "updatedAt" = $3
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        order.id,
        now,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        r#"
        INSERT INTO public."OrderEvent" (
            id, "tenantId", "orderId", type, "fromValue", "toValue",
            "actorMemberId", reason, "createdAt"
        )
        VALUES ($1, $2, $3, 'payment_recorded', $4, 'paid', $5, $6, $7)
        "#,
        uuid::Uuid::new_v4().to_string(),
        tenant.as_str(),
        order.id,
        order.financial_status,
        actor_member_id,
        reason,
        now,
    )
    .execute(&mut *tx)
    .await?;

    Ok(())
}
