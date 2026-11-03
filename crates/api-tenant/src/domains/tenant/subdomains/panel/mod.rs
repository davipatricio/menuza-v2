//! panel subdomain routes: the store dashboard.
//!
//! One module per resource, so resources can be written in parallel. This
//! module owns no route of its own: it merges the seventeen resource routers
//! and their documents, so a new route lands in exactly one file.

pub(crate) mod audit;
mod badges;
pub(crate) mod categories;
pub(crate) mod coupons;
pub(crate) mod customers;
pub(crate) mod departments;
mod integrations;
mod kits;
pub(crate) mod orders;
mod payments;
pub(crate) mod products;
mod search;
pub(crate) mod seo;
mod stores;
mod subcategories;
pub mod support;
pub(crate) mod tags;
mod team;

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .merge(audit::router())
        .merge(badges::router())
        .merge(categories::router())
        .merge(coupons::router())
        .merge(customers::router())
        .merge(departments::router())
        .merge(integrations::router())
        .merge(kits::router())
        .merge(orders::router())
        .merge(payments::router())
        .merge(products::router())
        .merge(search::router())
        .merge(seo::router())
        .merge(stores::router())
        .merge(subcategories::router())
        .merge(tags::router())
        .merge(team::router())
}

/// Paths this subdomain contributes to the tenant document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    let mut document = utoipa::openapi::OpenApiBuilder::new().build();

    document.merge(audit::openapi());
    document.merge(badges::openapi());
    document.merge(categories::openapi());
    document.merge(coupons::openapi());
    document.merge(customers::openapi());
    document.merge(departments::openapi());
    document.merge(integrations::openapi());
    document.merge(kits::openapi());
    document.merge(orders::openapi());
    document.merge(payments::openapi());
    document.merge(products::openapi());
    document.merge(search::openapi());
    document.merge(seo::openapi());
    document.merge(stores::openapi());
    document.merge(subcategories::openapi());
    document.merge(tags::openapi());
    document.merge(team::openapi());

    document
}
