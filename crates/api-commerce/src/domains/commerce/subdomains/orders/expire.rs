//! `POST /orders/{code}/expire` — close the payment window and give the wallet
//! reserve back.
//!
//! Worker-facing and token-gated, like `expire.impl.ts`: the internal token
//! proves the caller, the tenant scope proves the store, and there is no
//! session and no member. Idempotent by order code — a second run on an
//! already-expired order touches nothing.

use axum::Json;
use axum::extract::{Path, State};
use contract::commerce::orders::{ExpireOrderOutput, OrderCodeInput};
use menuza_http::extract::{InternalToken, TenantScope};
use persistence::commerce::orders;

use super::{error_of, tenant_of};
use crate::domains::commerce::support::ApiError;

#[utoipa::path(
    post,
    path = "/orders/{code}/expire",
    operation_id = "expireOrder",
    tag = "orders",
    params(("code" = String, Path, description = "Order code.")),
    request_body = Option<OrderCodeInput>,
    responses(
        (status = 200, body = ExpireOrderOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn expire_order(
    State(state): State<crate::State>,
    _internal: InternalToken,
    scope: TenantScope,
    Path(code): Path<String>,
    _body: Option<Json<OrderCodeInput>>,
) -> Result<Json<ExpireOrderOutput>, ApiError> {
    let tenant = tenant_of(&scope)?;

    let input = OrderCodeInput { code };
    input.validate().map_err(ApiError)?;

    let financial_status = orders::expire(&state.pool, &tenant, &input.code)
        .await
        .map_err(error_of)?;

    Ok(Json(ExpireOrderOutput { financial_status }))
}
