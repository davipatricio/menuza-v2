//! public subdomain routes (ported from `packages/api-commerce/src/domains/commerce/subdomains/public`).
//!
//! The storefront's four reads (MEN-260). They are anonymous: the tenant comes
//! from `TenantScope`, never from the caller, and a request that resolved none
//! answers the empty shape instead of failing.

mod get_product;
mod get_store;
mod list_menu;
mod list_sitemap;

use contract::ErrorCode;
use menuza_http::extract::TenantScope;
use persistence::tenant::TenantId;
use utoipa::OpenApi as _;

use crate::domains::commerce::support::ApiError;

/// The tenant the request claims, or `None` when it claimed none. A claim that
/// cannot become a `TenantId` is a request error, never a panic or a silent
/// fallback.
fn tenant_of(scope: &TenantScope) -> Result<Option<TenantId>, ApiError> {
    let Some(raw) = scope.tenant_id() else {
        return Ok(None);
    };

    TenantId::parse(raw)
        .map(Some)
        .map_err(|_| ApiError(ErrorCode::TenantNotResolved))
}

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route("/store", axum::routing::get(get_store::get_store))
        .route("/menu", axum::routing::get(list_menu::list_menu))
        .route(
            "/products/{productId}",
            axum::routing::get(get_product::get_product),
        )
        .route("/sitemap", axum::routing::get(list_sitemap::list_sitemap))
}

/// Paths this subdomain contributes to the commerce document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            get_store::get_store,
            list_menu::list_menu,
            get_product::get_product,
            list_sitemap::list_sitemap
        ),
        components(schemas(
            contract::commerce::public::PublicStore,
            contract::commerce::public::PublicSeo,
            contract::commerce::public::PublicMenu,
            contract::commerce::public::PublicDepartment,
            contract::commerce::public::PublicCategory,
            contract::commerce::public::PublicSubcategory,
            contract::commerce::public::PublicProduct,
            contract::commerce::public::PublicVariation,
            contract::commerce::public::PublicBadge,
            contract::commerce::public::PublicProductDetail,
            contract::commerce::public::PublicNutrition,
            contract::commerce::public::NutritionBasis,
            contract::commerce::public::NutritionLabelFormat,
            contract::commerce::public::NutritionSource,
            contract::commerce::public::PublicSitemap,
            contract::commerce::public::PublicSitemapEntry,
            contract::commerce::public::ChangeFrequency,
            get_product::ProductResponse
        ))
    )]
    struct Api;

    Api::openapi()
}
