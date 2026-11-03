//! orders resource: panel routes.
//!
//! The state machine is not re-derived here: [`persistence::commerce::orders`]
//! owns the legal tuples, the capability each one needs and the reason rule, so
//! this module only resolves the panel context, gates the write and maps the
//! engine's refusals onto the catalog.
//!
//! Reads reuse the commerce order row and its line/event helpers; the panel-only
//! fields (customer name, creation instant, trail actor names) come from the
//! panel queries in [`persistence::tenant::panel::orders`].

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::commerce::orders::{OrderAxis, RecordPaymentInput};
use contract::tenant::panel::orders::{
    PanelOrder, PanelOrderDetail, PanelOrderEvent, PanelOrderItem, PanelOrderOutput,
    PanelOrderStateOutput, PanelOrderTransition, PanelOrderTransitionInput,
    PanelOrderTransitionsOutput, PanelOrdersOutput, PanelOrdersQuery,
};
use persistence::commerce::orders::{self, OrderError, OrderRow, TransitionActor};
use persistence::tenant::panel::orders::{event_actors, order_list, order_panel_fields};

use super::support::{context, guard, iso};
use crate::domains::tenant::support::{ApiError, TENANT_CAPABILITIES, TenantRole, can, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/orders",
            axum::routing::get(list_orders),
        )
        .route(
            "/panel/stores/{storeSlug}/orders/{orderCode}",
            axum::routing::get(get_order),
        )
        .route(
            "/panel/stores/{storeSlug}/orders/{orderCode}/transitions",
            axum::routing::get(get_order_transitions),
        )
        .route(
            "/panel/stores/{storeSlug}/orders/{orderCode}/transition",
            axum::routing::post(transition_order),
        )
        .route(
            "/panel/stores/{storeSlug}/orders/{orderCode}/payment",
            axum::routing::post(record_order_payment),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            list_orders,
            get_order,
            get_order_transitions,
            transition_order,
            record_order_payment
        ),
        components(schemas(
            contract::tenant::panel::orders::PanelOrder,
            contract::tenant::panel::orders::PanelOrderDetail,
            contract::tenant::panel::orders::PanelOrderEvent,
            contract::tenant::panel::orders::PanelOrderItem,
            contract::tenant::panel::orders::PanelOrderOutput,
            contract::tenant::panel::orders::PanelOrderStateOutput,
            contract::tenant::panel::orders::PanelOrderTransition,
            contract::tenant::panel::orders::PanelOrderTransitionInput,
            contract::tenant::panel::orders::PanelOrderTransitionsOutput,
            contract::tenant::panel::orders::PanelOrdersOutput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The store's orders, newest first, narrowed by the optional closed filters.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/orders",
    operation_id = "listPanelOrders",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("financialStatus" = Option<String>, Query, description = "Narrow to one financial status."),
        ("fulfilmentStatus" = Option<String>, Query, description = "Narrow to one fulfilment status."),
        ("paymentMethod" = Option<String>, Query, description = "Narrow to one payment method.")
    ),
    responses(
        (status = 200, body = PanelOrdersOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_orders(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<PanelOrdersQuery>,
) -> Result<Json<PanelOrdersOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    query.validate().map_err(ApiError)?;

    let rows = order_list(
        &state.pool,
        &ctx.tenant,
        query.financial(),
        query.fulfilment(),
        query.payment(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PanelOrdersOutput {
        orders: rows.into_iter().map(panel_order).collect(),
    }))
}

/// One order, addressed by the code the dashboard URL carries, with its lines
/// and its append-only trail.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/orders/{orderCode}",
    operation_id = "getPanelOrder",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("orderCode" = String, Path, description = "The order's human code.")
    ),
    responses(
        (status = 200, body = PanelOrderOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_order(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, order_code)): Path<(String, String)>,
) -> Result<Json<PanelOrderOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let row = find_order(&state, &ctx.tenant, &order_code).await?;

    let fields = order_panel_fields(&state.pool, &ctx.tenant, &row.id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    let items = orders::items(&state.pool, &ctx.tenant, &row.id)
        .await
        .map_err(db_error)?;

    let events = orders::events(&state.pool, &ctx.tenant, &row.id)
        .await
        .map_err(db_error)?;

    let actors = event_actors(&state.pool, &ctx.tenant, &row.id)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|actor| (actor.event_id, actor.actor_name))
        .collect::<HashMap<_, _>>();

    Ok(Json(PanelOrderOutput {
        order: detail(
            row,
            &fields.customer_name,
            fields.created_at,
            items,
            events,
            &actors,
        ),
    }))
}

/// What the caller may do next on both axes.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/orders/{orderCode}/transitions",
    operation_id = "getPanelOrderTransitions",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("orderCode" = String, Path, description = "The order's human code.")
    ),
    responses(
        (status = 200, body = PanelOrderTransitionsOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_order_transitions(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, order_code)): Path<(String, String)>,
) -> Result<Json<PanelOrderTransitionsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let row = find_order(&state, &ctx.tenant, &order_code).await?;

    Ok(Json(PanelOrderTransitionsOutput {
        transitions: transitions(
            &row.financial_status,
            &row.fulfilment_status,
            &capabilities(ctx.member.role),
        ),
    }))
}

/// Moves one axis of the order, appending the trail entry.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/orders/{orderCode}/transition",
    operation_id = "transitionPanelOrder",
    tag = "panel",
    request_body = PanelOrderTransitionInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("orderCode" = String, Path, description = "The order's human code.")
    ),
    responses(
        (status = 200, body = PanelOrderStateOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn transition_order(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, order_code)): Path<(String, String)>,
    Json(input): Json<PanelOrderTransitionInput>,
) -> Result<Json<PanelOrderStateOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    // A refund is the narrower capability; every other move takes the write.
    guard(
        &ctx,
        if input.to == "refunded" {
            "orders:refund"
        } else {
            "orders:write"
        },
    )?;

    input.validate().map_err(ApiError)?;

    let capabilities = capabilities(ctx.member.role);

    let actor = TransitionActor {
        capabilities: &capabilities,
        member_id: Some(ctx.member.member_id.as_str()),
    };

    let output = orders::transition(
        &state.pool,
        &ctx.tenant,
        &order_code,
        input.axis,
        &input.to,
        input.reason.as_deref(),
        actor,
    )
    .await
    .map_err(order_error)?;

    Ok(Json(PanelOrderStateOutput {
        financial_status: output.financial_status.clone(),
        fulfilment_status: output.fulfilment_status.clone(),
        transitions: transitions(
            &output.financial_status,
            &output.fulfilment_status,
            &capabilities,
        ),
    }))
}

/// Records the money landing and credits the cashback exactly once.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/orders/{orderCode}/payment",
    operation_id = "recordPanelOrderPayment",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("orderCode" = String, Path, description = "The order's human code.")
    ),
    responses(
        (status = 200, body = PanelOrderStateOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn record_order_payment(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, order_code)): Path<(String, String)>,
) -> Result<Json<PanelOrderStateOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "orders:write")?;

    // The commerce body echoes the code; the path is what addresses the order.
    let input = RecordPaymentInput {
        code: String::new(),
    };

    orders::record_payment(
        &state.pool,
        &ctx.tenant,
        &order_code,
        &input,
        Some(ctx.member.member_id.as_str()),
    )
    .await
    .map_err(order_error)?;

    let row = find_order(&state, &ctx.tenant, &order_code).await?;
    let capabilities = capabilities(ctx.member.role);

    Ok(Json(PanelOrderStateOutput {
        financial_status: row.financial_status.clone(),
        fulfilment_status: row.fulfilment_status.clone(),
        transitions: transitions(&row.financial_status, &row.fulfilment_status, &capabilities),
    }))
}

/// One order of this tenant, or `NOT_FOUND`.
async fn find_order(
    state: &crate::State,
    tenant: &persistence::tenant::TenantId,
    code: &str,
) -> Result<OrderRow, ApiError> {
    orders::order_by_code(&state.pool, tenant, code)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)
}

/// The capabilities the caller's role grants, as the state machine reads them.
/// MCP reuses this: the tool passes the grant's role through the same map.
pub(crate) fn capabilities(role: TenantRole) -> Vec<&'static str> {
    TENANT_CAPABILITIES
        .into_iter()
        .filter(|capability| can(role, capability))
        .collect()
}

/// Every legal move on both axes that the caller may perform. Financial first,
/// then fulfilment, so the dashboard draws the buttons in the table's order.
/// MCP reuses this: the tool returns the same transition list.
pub(crate) fn transitions(
    financial_status: &str,
    fulfilment_status: &str,
    capabilities: &[&str],
) -> Vec<PanelOrderTransition> {
    let mut transitions = Vec::new();

    for (axis, from) in [
        (OrderAxis::Financial, financial_status),
        (OrderAxis::Fulfilment, fulfilment_status),
    ] {
        transitions.extend(
            orders::next_transitions(axis, from, capabilities)
                .0
                .into_iter()
                .map(|rule| PanelOrderTransition {
                    axis: rule.axis,
                    to: rule.to,
                    requires_reason: rule.requires_reason,
                }),
        );
    }

    transitions
}

/// A refused order write as the catalog code the client switches on.
fn order_error(error: OrderError) -> ApiError {
    match error {
        OrderError::NotFound => ApiError::not_found(),
        OrderError::Invalid { .. } => ApiError(ErrorCode::Conflict),
        OrderError::Forbidden => ApiError::forbidden(),
        OrderError::ReasonRequired => ApiError(ErrorCode::ValidationFailed),
        OrderError::Db(_) => ApiError(ErrorCode::Internal),
    }
}

/// The list row as the panel's table reads it.
/// MCP reuses this: the tool maps the same order list rows.
pub(crate) fn panel_order(row: persistence::tenant::panel::orders::PanelOrderRow) -> PanelOrder {
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

/// One order plus its lines and trail, with the actor names resolved.
/// MCP reuses this: the tool maps the same detail rows.
pub(crate) fn detail(
    row: OrderRow,
    customer_name: &str,
    created_at: chrono::NaiveDateTime,
    items: Vec<contract::commerce::orders::OrderItem>,
    events: Vec<contract::commerce::orders::OrderEvent>,
    actors: &HashMap<String, Option<String>>,
) -> PanelOrderDetail {
    PanelOrderDetail {
        id: row.id,
        code: row.code,
        customer_id: row.customer_id,
        customer_name: customer_name.to_owned(),
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
        created_at: iso(created_at),
        items: items.into_iter().map(panel_item).collect(),
        events: events
            .into_iter()
            .map(|event| panel_event(event, actors))
            .collect(),
    }
}

/// One line as the panel renders it.
fn panel_item(item: contract::commerce::orders::OrderItem) -> PanelOrderItem {
    PanelOrderItem {
        id: item.id,
        name: item.name,
        unit_price_cents: item.unit_price_cents,
        quantity: item.quantity,
        line_total_cents: item.line_total_cents,
        options_label: item.options_label,
    }
}

/// One trail entry with the display name behind its actor.
fn panel_event(
    event: contract::commerce::orders::OrderEvent,
    actors: &HashMap<String, Option<String>>,
) -> PanelOrderEvent {
    let actor_name = actors.get(&event.id).and_then(|name| name.clone());

    PanelOrderEvent {
        id: event.id,
        event_type: event.event_type,
        from_value: event.from_value,
        to_value: event.to_value,
        reason: event.reason,
        actor_name,
        created_at: event.created_at,
    }
}
