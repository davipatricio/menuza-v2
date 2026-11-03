//! orders subdomain routes (ported from `packages/api-commerce/src/domains/commerce/subdomains/orders`).
//!
//! An order is addressed by its human code, never its id. The read and the
//! transition are tenant scoped and behind a store member with a capability;
//! `expire` is worker-facing, so it proves the internal token instead of a
//! session.

mod create;
mod expire;
mod get;
mod record_payment;
mod transition;

use contract::ErrorCode;
use menuza_http::extract::TenantScope;
use persistence::commerce::orders::OrderError;
use persistence::tenant::TenantId;
use utoipa::OpenApi as _;

use crate::domains::commerce::support::{ApiError, TENANT_CAPABILITIES, TenantRole, can};

/// The tenant the request claims. An order never answers without one: an
/// absent or unparsable claim is `TENANT_NOT_RESOLVED`, never an empty page.
fn tenant_of(scope: &TenantScope) -> Result<TenantId, ApiError> {
    let Some(raw) = scope.tenant_id() else {
        return Err(ApiError(ErrorCode::TenantNotResolved));
    };

    TenantId::parse(raw).map_err(|_| ApiError(ErrorCode::TenantNotResolved))
}

/// The capabilities the caller's role grants, as the state machine reads them.
fn capabilities_of(role: TenantRole) -> Vec<&'static str> {
    TENANT_CAPABILITIES
        .iter()
        .copied()
        .filter(|capability| can(role, capability))
        .collect()
}

/// A refused order write as the catalog code the client switches on.
fn error_of(error: OrderError) -> ApiError {
    match error {
        OrderError::NotFound => ApiError::not_found(),
        OrderError::Invalid { .. } => ApiError(ErrorCode::Conflict),
        OrderError::Forbidden => ApiError::forbidden(),
        OrderError::ReasonRequired => ApiError(ErrorCode::ValidationFailed),
        OrderError::Db(_) => ApiError(ErrorCode::Internal),
    }
}

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route("/orders", axum::routing::post(create::create_order))
        .route("/orders/{code}", axum::routing::get(get::get_order))
        .route(
            "/orders/{code}/transition",
            axum::routing::post(transition::transition_order),
        )
        .route(
            "/orders/{code}/payment",
            axum::routing::post(record_payment::record_order_payment),
        )
        .route(
            "/orders/{code}/expire",
            axum::routing::post(expire::expire_order),
        )
}

/// Paths this subdomain contributes to the commerce document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            create::create_order,
            get::get_order,
            transition::transition_order,
            record_payment::record_order_payment,
            expire::expire_order
        ),
        components(schemas(
            contract::commerce::orders::CreateOrderInput,
            contract::commerce::orders::CreateOrderLine,
            contract::commerce::orders::CreateOrderOutput,
            contract::commerce::orders::Order,
            contract::commerce::orders::OrderAxis,
            contract::commerce::orders::OrderEvent,
            contract::commerce::orders::OrderItem,
            contract::commerce::orders::OrderTransition,
            contract::commerce::orders::OrderTransitions,
            contract::commerce::orders::RejectedCoupon,
            contract::commerce::orders::RecordPaymentInput,
            contract::commerce::orders::RecordPaymentOutput,
            contract::commerce::orders::TransitionOrderInput,
            contract::commerce::orders::TransitionOrderOutput,
            contract::commerce::orders::ExpireOrderOutput
        ))
    )]
    struct Api;

    Api::openapi()
}

#[cfg(test)]
mod tests {
    use contract::ErrorCode;
    use persistence::commerce::orders::OrderError;

    use super::{TenantRole, capabilities_of, error_of};

    #[test]
    fn order_errors_map_to_the_catalog() {
        assert_eq!(
            error_of(OrderError::Invalid {
                from: "paid".to_owned(),
                to: "pending".to_owned()
            })
            .0,
            ErrorCode::Conflict
        );
        assert_eq!(error_of(OrderError::NotFound).0, ErrorCode::NotFound);
        assert_eq!(error_of(OrderError::Forbidden).0, ErrorCode::Forbidden);
        assert_eq!(
            error_of(OrderError::ReasonRequired).0,
            ErrorCode::ValidationFailed
        );
    }

    #[test]
    fn capabilities_follow_the_role_matrix() {
        assert_eq!(capabilities_of(TenantRole::Owner).len(), 11);
        assert!(!capabilities_of(TenantRole::Staff).contains(&"orders:refund"));
        assert!(capabilities_of(TenantRole::Staff).contains(&"orders:write"));
    }
}
