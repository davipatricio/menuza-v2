//! stores resource: panel routes.
//!
//! `POST /panel/stores` is the one panel route that names no store: the caller
//! creates one and becomes its `owner`. Everything else resolves `storeSlug`
//! through the session's membership first, so the tenant is never a value the
//! client chose.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::stores::{CreateStoreInput, PanelStore};
use contract::tenant::session::{MemberKind, SessionMember, TenantRole};
use domain::session::{TENANT_COOKIE, cookie_value, is_same_origin, parse_cookies, public_host};
use persistence::tenant::TenantId;
use persistence::tenant::panel::stores::{store_create, store_read, store_slug_taken};
use persistence::tenant::session::{MemberRow, member_by_id};

use super::support::{PanelContext, context, now};
use crate::domains::tenant::support::{
    ApiError, TenantRole as MemberRole, db_error, require_member,
};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route("/panel/stores", axum::routing::post(create_store))
        .route("/panel/stores/{storeSlug}", axum::routing::get(get_store))
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(create_store, get_store),
        components(schemas(
            contract::tenant::panel::stores::CreateStoreInput,
            contract::tenant::panel::stores::PanelStore
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Creates a store and makes the authenticated caller its `owner`.
#[utoipa::path(
    post,
    path = "/panel/stores",
    operation_id = "createPanelStore",
    tag = "panel",
    request_body = CreateStoreInput,
    responses(
        (status = 200, body = PanelStore),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_store(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Json(input): Json<CreateStoreInput>,
) -> Result<Json<PanelStore>, ApiError> {
    assert_same_origin(&headers)?;

    let token = cookie_token(&headers).ok_or_else(ApiError::unauthorized)?;
    let member = require_member(&state.pool, &token).await?;

    input.validate().map_err(ApiError)?;

    let slug = input.slug.trim().to_lowercase();

    if store_slug_taken(&state.pool, &slug)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let tenant = TenantId::parse(&uuid::Uuid::new_v4().to_string())
        .map_err(|_| ApiError(ErrorCode::Internal))?;

    let created = store_create(
        &state.pool,
        &tenant,
        &slug,
        &input.display_name,
        &member.member_id,
        now(),
    )
    .await
    .map_err(db_error)?;

    // A concurrent create for the same slug wins the unique index; present it
    // as the same conflict the pre-check reports.
    if !created {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let stored = member_by_id(&state.pool, &member.member_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(PanelStore {
        tenant_id: tenant.as_str().to_owned(),
        tenant_slug: slug,
        tenant_name: input.display_name,
        role: TenantRole::Owner,
        member: session_member(&stored),
    }))
}

/// Resolves the dashboard URL's `storeSlug` to the tenant and the caller's
/// membership. A non-member and an unknown store both answer `NOT_FOUND`.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}",
    operation_id = "getPanelStore",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelStore),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_store(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelStore>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let store = store_read(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(
        panel_store(&state, &ctx, &store.slug, &store.display_name).await?,
    ))
}

/// The response body every store route returns: store, role and the member.
async fn panel_store(
    state: &crate::State,
    ctx: &PanelContext,
    slug: &str,
    display_name: &str,
) -> Result<PanelStore, ApiError> {
    let member = member_by_id(&state.pool, &ctx.member.member_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    Ok(PanelStore {
        tenant_id: ctx.tenant.as_str().to_owned(),
        tenant_slug: slug.to_owned(),
        tenant_name: display_name.to_owned(),
        role: match ctx.member.role {
            MemberRole::Owner => TenantRole::Owner,
            MemberRole::Admin => TenantRole::Admin,
            MemberRole::Staff => TenantRole::Staff,
        },
        member: session_member(&member),
    })
}

/// The raw tenant session token from the cookie header, if any.
fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let cookies = parse_cookies(headers.get("cookie").and_then(|value| value.to_str().ok()));

    cookie_value(&cookies, TENANT_COOKIE).map(str::to_owned)
}

/// Rejects a state-changing request whose `Origin`/`Referer` does not match the
/// host the browser used. A non-browser caller that sends neither is allowed.
fn assert_same_origin(headers: &HeaderMap) -> Result<(), ApiError> {
    let header = |name: &str| headers.get(name).and_then(|value| value.to_str().ok());

    if is_same_origin(
        header("origin"),
        header("referer"),
        public_host(header("x-forwarded-host"), header("host")),
    ) {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

/// The stored member as the session payload carries it; an unknown `kind` is a
/// human, the fallback the TS guard used.
fn session_member(member: &MemberRow) -> SessionMember {
    SessionMember {
        id: member.id.clone(),
        email: member.email.clone(),
        name: member.name.clone(),
        kind: match member.kind.as_str() {
            "bot" => MemberKind::Bot,
            _ => MemberKind::Human,
        },
    }
}
