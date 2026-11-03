//! `POST /orders/{code}/transition` — move one axis of an order.
//!
//! The state machine in persistence decides: a legal tuple, a capability the
//! rule requires and a reason when the move demands one. Its refusals map onto
//! the catalog so the dashboard can tell a stale button from a missing reason.

use axum::Json;
use axum::extract::{Path, State};
use contract::commerce::orders::{TransitionOrderInput, TransitionOrderOutput};
use menuza_http::extract::{CommerceSession, TenantScope};
use persistence::commerce::orders::{self, TransitionActor};

use super::{capabilities_of, error_of, tenant_of};
use crate::domains::commerce::support::{ApiError, require_capability, require_member};

#[utoipa::path(
    post,
    path = "/orders/{code}/transition",
    operation_id = "transitionOrder",
    tag = "orders",
    params(("code" = String, Path, description = "Order code.")),
    request_body = TransitionOrderInput,
    responses(
        (status = 200, body = TransitionOrderOutput),
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
    scope: TenantScope,
    session: CommerceSession,
    Path(code): Path<String>,
    Json(input): Json<TransitionOrderInput>,
) -> Result<Json<TransitionOrderOutput>, ApiError> {
    let tenant = tenant_of(&scope)?;
    let member = require_member(&state.pool, &tenant, &session.0).await?;
    require_capability(&member, "orders:write")?;

    // The strict body still echoes the code, so its gate runs; the path is what
    // addresses the order.
    input.validate().map_err(ApiError)?;

    let capabilities = capabilities_of(member.role);

    let output = orders::transition(
        &state.pool,
        &tenant,
        &code,
        input.axis,
        &input.to,
        input.reason.as_deref(),
        TransitionActor {
            capabilities: &capabilities,
            member_id: Some(&member.member_id),
        },
    )
    .await
    .map_err(error_of)?;

    Ok(Json(output))
}
