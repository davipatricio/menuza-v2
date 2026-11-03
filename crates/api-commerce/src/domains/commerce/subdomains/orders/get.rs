//! `GET /orders/{code}` — the dashboard's order page.
//!
//! The money, both status axes, the lines and the append-only event trail, plus
//! the transitions the **caller** may perform: `next_transitions` filtered
//! through the caller's own capabilities, so a `staff` member never sees a
//! refund they would be refused.

use axum::Json;
use axum::extract::{Path, State};
use contract::commerce::orders::{Order, OrderAxis, OrderCodeInput, OrderTransitions};
use menuza_http::extract::{CommerceSession, TenantScope};
use persistence::commerce::orders::{self, next_transitions};

use super::{capabilities_of, tenant_of};
use crate::domains::commerce::support::{ApiError, db_error, require_capability, require_member};

#[utoipa::path(
    get,
    path = "/orders/{code}",
    operation_id = "getOrder",
    tag = "orders",
    params(("code" = String, Path, description = "Order code.")),
    responses(
        (status = 200, body = Order),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_order(
    State(state): State<crate::State>,
    scope: TenantScope,
    session: CommerceSession,
    Path(code): Path<String>,
) -> Result<Json<Order>, ApiError> {
    let tenant = tenant_of(&scope)?;
    let member = require_member(&state.pool, &tenant, &session.0).await?;
    require_capability(&member, "orders:read")?;

    let input = OrderCodeInput { code };
    input.validate().map_err(ApiError)?;

    let row = orders::order_by_code(&state.pool, &tenant, &input.code)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    let items = orders::items(&state.pool, &tenant, &row.id)
        .await
        .map_err(db_error)?;
    let events = orders::events(&state.pool, &tenant, &row.id)
        .await
        .map_err(db_error)?;

    let capabilities = capabilities_of(member.role);
    let mut allowed = Vec::new();

    // Financial first, then fulfilment: the dashboard draws the buttons in the
    // order the table declares.
    for (axis, from) in [
        (OrderAxis::Financial, row.financial_status.as_str()),
        (OrderAxis::Fulfilment, row.fulfilment_status.as_str()),
    ] {
        allowed.extend(next_transitions(axis, from, &capabilities).0);
    }

    Ok(Json(Order {
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
        paid_at: row.paid_at,
        expires_at: row.expires_at,
        coupon_code: row.coupon_code,
        // Checkout records the coupons that lost at creation time; nothing
        // reads them back on the order page yet.
        rejected_coupons: Vec::new(),
        items,
        events,
        allowed_next_transitions: OrderTransitions(allowed),
    }))
}
