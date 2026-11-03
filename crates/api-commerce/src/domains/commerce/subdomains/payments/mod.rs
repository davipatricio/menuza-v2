//! payments subdomain routes (ported from `packages/api-commerce/src/domains/commerce/subdomains/payments`).
//!
//! Provider callbacks are persisted and queued by the webhook receiver; the
//! worker then calls the one route here to apply a stored event. That route is
//! internal: the shared token proves the caller and the tenant scope proves the
//! store, so there is no session and no member.

mod apply;

use contract::ErrorCode;
use menuza_http::extract::TenantScope;
use persistence::tenant::TenantId;
use utoipa::OpenApi as _;

use crate::domains::commerce::support::ApiError;

/// The tenant the request claims. A gateway event never answers without one: an
/// absent or unparsable claim is `TENANT_NOT_RESOLVED`, never a `missing`
/// outcome the worker would read as settled.
fn tenant_of(scope: &TenantScope) -> Result<TenantId, ApiError> {
    let Some(raw) = scope.tenant_id() else {
        return Err(ApiError(ErrorCode::TenantNotResolved));
    };

    TenantId::parse(raw).map_err(|_| ApiError(ErrorCode::TenantNotResolved))
}

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/payments/gateway-events/{gateway_event_id}/apply",
        axum::routing::post(apply::apply_gateway_event),
    )
}

/// Paths this subdomain contributes to the commerce document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(apply::apply_gateway_event),
        components(schemas(
            contract::commerce::payments::ApplyGatewayEventInput,
            contract::commerce::payments::ApplyGatewayEventOutput,
            contract::commerce::payments::GatewayEventOutcome
        ))
    )]
    struct Api;

    Api::openapi()
}
