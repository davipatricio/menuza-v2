//! account subdomain routes: password change and session revocation.
//!
//! The surface is member-level: no `storeSlug`, no tenant scope. Sessions are
//! addressed by the SHA-256 digest `GET /account/sessions` exposes, so a digest
//! echoed back is already the storage key.

mod list_sessions;
mod password;
mod revoke_others;
mod revoke_session;
mod support;

use utoipa::OpenApi as _;

/// Routes this subdomain owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/account/password",
            axum::routing::put(password::change_password),
        )
        .route(
            "/account/sessions",
            axum::routing::get(list_sessions::list_sessions),
        )
        .route(
            "/account/sessions/revoke-others",
            axum::routing::post(revoke_others::revoke_other_sessions),
        )
        .route(
            "/account/sessions/{sessionId}",
            axum::routing::delete(revoke_session::revoke_session),
        )
}

/// Paths this subdomain contributes to the tenant document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            password::change_password,
            list_sessions::list_sessions,
            revoke_others::revoke_other_sessions,
            revoke_session::revoke_session
        ),
        components(schemas(
            contract::tenant::account::ChangePasswordInput,
            contract::tenant::account::ChangePasswordOutput,
            contract::tenant::account::ActiveSession,
            contract::tenant::account::ActiveSessionsOutput,
            contract::tenant::account::RevokeSessionOutput
        ))
    )]
    struct Api;

    Api::openapi()
}
