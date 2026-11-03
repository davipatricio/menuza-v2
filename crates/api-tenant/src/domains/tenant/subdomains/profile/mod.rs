//! profile subdomain routes: onboarding.
//!
//! Member-level, like the account surface: the survey is unique on `memberId`,
//! so no `storeSlug` or tenant header reaches these handlers.

mod save_onboarding;

use utoipa::OpenApi as _;

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/profile/onboarding",
        axum::routing::post(save_onboarding::save_onboarding),
    )
}

/// Paths this subdomain contributes to the tenant document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(save_onboarding::save_onboarding),
        components(schemas(
            contract::tenant::profile::SaveOnboardingInput,
            contract::tenant::session::Onboarding,
            contract::tenant::session::OnboardingPersona,
            contract::tenant::session::OnboardingSegment,
            contract::tenant::session::OnboardingReferral
        ))
    )]
    struct Api;

    Api::openapi()
}
