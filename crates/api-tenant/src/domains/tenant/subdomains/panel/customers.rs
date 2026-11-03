//! customers resource: panel routes.
//!
//! A customer row carries no total of its own: the order count and the amount
//! spent are derived from the store's orders on every read, so the list and the
//! detail page can never disagree with the order list.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::tenant::panel::customers::{
    PanelCustomer, PanelCustomerOutput, PanelCustomersOutput,
};
use contract::tenant::panel::orders::PanelOrder;
use persistence::tenant::panel::customers::{
    CustomerRow, customer_list, customer_orders, customer_row,
};
use persistence::tenant::panel::orders::PanelOrderRow;

use super::support::{context, guard, iso};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/customers",
            axum::routing::get(list_customers),
        )
        .route(
            "/panel/stores/{storeSlug}/customers/{customerId}",
            axum::routing::get(get_customer),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(list_customers, get_customer),
        components(schemas(
            contract::tenant::panel::customers::PanelCustomer,
            contract::tenant::panel::customers::PanelCustomersOutput,
            contract::tenant::panel::customers::PanelCustomerOutput,
            contract::tenant::panel::orders::PanelOrder
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Every customer of the store, with order count and total spent in cents.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/customers",
    operation_id = "listPanelCustomers",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelCustomersOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_customers(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelCustomersOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let rows = customer_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let customers = rows.into_iter().map(panel_customer).collect();

    Ok(Json(PanelCustomersOutput { customers }))
}

/// One customer and their orders, newest first.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/customers/{customerId}",
    operation_id = "getPanelCustomer",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("customerId" = String, Path, description = "The customer to read.")
    ),
    responses(
        (status = 200, body = PanelCustomerOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_customer(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, customer_id)): Path<(String, String)>,
) -> Result<Json<PanelCustomerOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let Some(row) = customer_row(&state.pool, &ctx.tenant, &customer_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let orders = customer_orders(&state.pool, &ctx.tenant, &customer_id)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(panel_order)
        .collect();

    Ok(Json(PanelCustomerOutput {
        customer: panel_customer(row),
        orders,
    }))
}

/// The derived row as the contract carries it.
/// MCP reuses this: the tool maps the same customer rows.
pub(crate) fn panel_customer(row: CustomerRow) -> PanelCustomer {
    PanelCustomer {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        orders_count: row.orders_count,
        total_spent_cents: row.total_spent_cents,
    }
}

/// The order as the panel's tables render it.
/// MCP reuses this: the tool maps the same customer order rows.
pub(crate) fn panel_order(row: PanelOrderRow) -> PanelOrder {
    PanelOrder {
        id: row.id,
        code: row.code,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        subtotal_cents: row.subtotal_cents,
        discount_cents: row.discount_cents,
        shipping_cents: row.shipping_cents,
        wallet_applied_cents: row.wallet_applied_cents,
        cashback_cents: row.cashback_cents,
        total_cents: row.total_cents,
        financial_status: row.financial_status,
        fulfilment_status: row.fulfilment_status,
        payment_method: row.payment_method,
        paid_at: row.paid_at.map(iso),
        expires_at: row.expires_at.map(iso),
        created_at: iso(row.created_at),
    }
}
