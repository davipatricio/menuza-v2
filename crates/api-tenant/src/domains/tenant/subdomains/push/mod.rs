//! push subdomain routes: web-push subscriptions and preferences.
//!
//! The public key is anonymous; every other route needs the tenant the proxy
//! resolved, the `menuza_tenant_sid` session and a membership binding the two.

mod get_preferences;
mod get_public_key;
mod subscribe;
mod support;
mod unsubscribe;
mod update_preferences;

use utoipa::OpenApi as _;

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/push/public-key",
            axum::routing::get(get_public_key::get_public_key),
        )
        .route(
            "/push/preferences",
            axum::routing::get(get_preferences::get_preferences)
                .put(update_preferences::update_preferences),
        )
        .route(
            "/push/subscriptions",
            axum::routing::post(subscribe::subscribe).delete(unsubscribe::unsubscribe),
        )
}

/// Paths this subdomain contributes to the tenant document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            get_public_key::get_public_key,
            get_preferences::get_preferences,
            update_preferences::update_preferences,
            subscribe::subscribe,
            unsubscribe::unsubscribe
        ),
        components(schemas(
            contract::tenant::push::PushEvent,
            contract::tenant::push::PushSubscriptionKeys,
            contract::tenant::push::PushSubscriptionInput,
            contract::tenant::push::PushUnsubscribeInput,
            contract::tenant::push::PushPreferencesInput,
            contract::tenant::push::GetPublicKeyOutput,
            contract::tenant::push::PushPreferencesOutput,
            contract::tenant::push::PushSuccessOutput
        ))
    )]
    struct Api;

    Api::openapi()
}
