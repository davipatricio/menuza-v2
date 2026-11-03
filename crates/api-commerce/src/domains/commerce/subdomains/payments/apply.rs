//! `POST /payments/gateway-events/{gatewayEventId}/apply` — act on one stored
//! provider event.
//!
//! Internal only, like `applyGatewayEvent.impl.ts`: the internal token proves
//! the caller, the tenant scope proves the store, and there is no session. An
//! event this store does not hold is answered `missing`, not `NOT_FOUND` — the
//! worker reads that as an outcome and stops retrying, instead of treating a
//! lost event as a broken route.

use axum::Json;
use axum::extract::{Path, State};
use contract::ErrorCode;
use contract::commerce::payments::{
    ApplyGatewayEventInput, ApplyGatewayEventOutput, GatewayEventOutcome,
};
use menuza_http::extract::{InternalToken, TenantScope};
use persistence::commerce::payments::{self, GatewayError};

use super::tenant_of;
use crate::domains::commerce::support::ApiError;

/// A refused apply as either the contract answer or the catalog code. A missing
/// event is an outcome the worker acts on; a broken database is still a 500.
fn outcome_of(error: GatewayError) -> Result<ApplyGatewayEventOutput, ApiError> {
    match error {
        GatewayError::NotFound => Ok(ApplyGatewayEventOutput {
            status: GatewayEventOutcome::Missing,
        }),
        GatewayError::Db(_) => Err(ApiError(ErrorCode::Internal)),
    }
}

#[utoipa::path(
    post,
    path = "/payments/gateway-events/{gatewayEventId}/apply",
    operation_id = "applyGatewayEvent",
    tag = "payments",
    params((
        "gatewayEventId" = String,
        Path,
        description = "Id of the already-persisted gateway event."
    )),
    request_body = ApplyGatewayEventInput,
    responses(
        (status = 200, body = ApplyGatewayEventOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn apply_gateway_event(
    State(state): State<crate::State>,
    _internal: InternalToken,
    scope: TenantScope,
    Path(gateway_event_id): Path<String>,
    Json(input): Json<ApplyGatewayEventInput>,
) -> Result<Json<ApplyGatewayEventOutput>, ApiError> {
    let tenant = tenant_of(&scope)?;

    // The strict body still echoes the id, so its gate runs; the path is what
    // addresses the event.
    input.validate().map_err(ApiError)?;

    let output = match payments::apply_gateway_event(&state.pool, &tenant, &gateway_event_id).await
    {
        Ok(output) => output,
        Err(error) => outcome_of(error)?,
    };

    Ok(Json(output))
}

#[cfg(test)]
mod tests {
    use contract::ErrorCode;
    use contract::commerce::payments::GatewayEventOutcome;
    use persistence::commerce::payments::GatewayError;

    use super::outcome_of;

    #[test]
    fn a_missing_event_is_an_outcome_not_a_404() {
        let output = outcome_of(GatewayError::NotFound).expect("missing is not an error");

        assert_eq!(output.status, GatewayEventOutcome::Missing);
    }

    #[test]
    fn a_broken_database_is_still_a_500() {
        let error = outcome_of(GatewayError::Db(sqlx::Error::RowNotFound))
            .expect_err("a database failure is an error");

        assert_eq!(error.0, ErrorCode::Internal);
    }
}
