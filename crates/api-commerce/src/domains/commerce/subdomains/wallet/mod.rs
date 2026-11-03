//! wallet subdomain routes (ported from `packages/api-commerce/src/domains/commerce/subdomains/wallet`).
//!
//! The customer wallet (MEN-92): one per customer per tenant. Both routes are
//! tenant scoped and behind a store member with a capability, so the tenant
//! comes from `TenantScope` and a request that resolved none is refused.

mod adjust;
mod get;

use contract::ErrorCode;
use menuza_http::extract::TenantScope;
use persistence::tenant::TenantId;
use utoipa::OpenApi as _;

use crate::domains::commerce::support::ApiError;

/// The tenant the request claims. Unlike the anonymous storefront reads, the
/// wallet cannot answer without one: an absent or unparsable claim is
/// `TENANT_NOT_RESOLVED`, never an empty wallet.
fn tenant_of(scope: &TenantScope) -> Result<TenantId, ApiError> {
    let Some(raw) = scope.tenant_id() else {
        return Err(ApiError(ErrorCode::TenantNotResolved));
    };

    TenantId::parse(raw).map_err(|_| ApiError(ErrorCode::TenantNotResolved))
}

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route("/wallet", axum::routing::get(get::get_wallet))
        .route("/wallet/adjust", axum::routing::post(adjust::adjust_wallet))
}

/// Paths this subdomain contributes to the commerce document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(get::get_wallet, adjust::adjust_wallet),
        components(schemas(
            contract::commerce::wallet::GetWalletInput,
            contract::commerce::wallet::AdjustWalletInput,
            contract::commerce::wallet::AdjustWalletOutput,
            contract::commerce::wallet::Wallet,
            contract::commerce::wallet::WalletTransaction
        ))
    )]
    struct Api;

    Api::openapi()
}
