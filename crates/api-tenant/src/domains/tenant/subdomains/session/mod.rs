//! session subdomain routes: login, register, current session and logout.
//!
//! The management session is the `menuza_tenant_sid` cookie; there is no tenant
//! header on this surface. Login verifies the argon2 hash before writing the
//! session row, registration writes the member and the session in one
//! transaction, and logout revokes the current row and clears the cookie.

mod current;
mod login;
mod logout;
mod register;
mod support;

use utoipa::OpenApi as _;

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route("/session/login", axum::routing::post(login::login))
        .route("/session/register", axum::routing::post(register::register))
        .route("/session/logout", axum::routing::post(logout::logout))
        .route("/session/current", axum::routing::get(current::current))
}

/// Paths this subdomain contributes to the tenant document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(login::login, register::register, logout::logout, current::current),
        components(schemas(
            contract::tenant::session::SessionMember,
            contract::tenant::session::SessionMembership,
            contract::tenant::session::MemberKind,
            contract::tenant::session::TenantRole,
            contract::tenant::session::Onboarding,
            contract::tenant::session::OnboardingPersona,
            contract::tenant::session::OnboardingSegment,
            contract::tenant::session::OnboardingReferral,
            contract::tenant::session::LoginInput,
            contract::tenant::session::RegisterInput,
            contract::tenant::session::LoginOutput,
            contract::tenant::session::LogoutOutput,
            contract::tenant::session::CurrentOutput
        ))
    )]
    struct Api;

    Api::openapi()
}
