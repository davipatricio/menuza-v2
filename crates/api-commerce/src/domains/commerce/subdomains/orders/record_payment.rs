//! `POST /orders/{code}/payment` — the money landed, recorded by the store.
//!
//! The store arm of a gateway confirmation: both land in the same persistence
//! call, so a manual record and a provider callback never disagree about
//! cashback. Recording on an already-paid order answers from its row and
//! touches nothing.

use axum::Json;
use axum::extract::{Path, State};
use contract::commerce::orders::{RecordPaymentInput, RecordPaymentOutput};
use menuza_http::extract::{CommerceSession, TenantScope};
use persistence::commerce::orders;

use super::{error_of, tenant_of};
use crate::domains::commerce::support::{ApiError, require_capability, require_member};

#[utoipa::path(
    post,
    path = "/orders/{code}/payment",
    operation_id = "recordOrderPayment",
    tag = "orders",
    params(("code" = String, Path, description = "Order code.")),
    request_body = RecordPaymentInput,
    responses(
        (status = 200, body = RecordPaymentOutput),
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
    scope: TenantScope,
    session: CommerceSession,
    Path(code): Path<String>,
    Json(input): Json<RecordPaymentInput>,
) -> Result<Json<RecordPaymentOutput>, ApiError> {
    let tenant = tenant_of(&scope)?;
    let member = require_member(&state.pool, &tenant, &session.0).await?;
    require_capability(&member, "orders:write")?;

    // The strict body still echoes the code, so its gate runs; the path is what
    // addresses the order.
    input.validate().map_err(ApiError)?;

    let output = orders::record_payment(
        &state.pool,
        &tenant,
        &code,
        &input,
        Some(member.member_id.as_str()),
    )
    .await
    .map_err(error_of)?;

    Ok(Json(output))
}
