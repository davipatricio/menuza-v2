//! badges resource: panel routes.
//!
//! A badge is a name, an image URL and a display order. The update is partial —
//! an omitted field keeps its stored value — and only absolute `http(s)` URLs
//! are accepted, because the storefront renders the URL as-is.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::badges::{
    CreateBadgeInput, PanelBadge, PanelBadgeSuccess, PanelBadgesOutput, UpdateBadgeInput,
};
use persistence::tenant::panel::badges::{
    BadgeWrite, badge_create, badge_delete, badge_list, badge_name_taken, badge_read, badge_update,
};

use super::support::{context, guard, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/badges",
            axum::routing::get(list_badges).post(create_badge),
        )
        .route(
            "/panel/stores/{storeSlug}/badges/{badgeId}",
            axum::routing::put(update_badge).delete(delete_badge),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(list_badges, create_badge, update_badge, delete_badge),
        components(schemas(
            contract::tenant::panel::badges::CreateBadgeInput,
            contract::tenant::panel::badges::UpdateBadgeInput,
            contract::tenant::panel::badges::PanelBadge,
            contract::tenant::panel::badges::PanelBadgesOutput,
            contract::tenant::panel::badges::PanelBadgeSuccess
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Badges with their product counts, by display order then name.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/badges",
    operation_id = "listPanelBadges",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelBadgesOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_badges(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelBadgesOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let rows = badge_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let badges = rows
        .into_iter()
        .map(|row| PanelBadge {
            id: row.id,
            name: row.name,
            image_url: row.image_url,
            sort_order: row.sort_order,
            is_active: row.is_active,
            items_count: row.items_count,
        })
        .collect();

    Ok(Json(PanelBadgesOutput { badges }))
}

/// Creates a badge; order and visibility default to `0` and `true`.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/badges",
    operation_id = "createPanelBadge",
    tag = "panel",
    request_body = CreateBadgeInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelBadgeSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_badge(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<CreateBadgeInput>,
) -> Result<Json<PanelBadgeSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let name = input.name.trim();

    if badge_name_taken(&state.pool, &ctx.tenant, name)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    badge_create(
        &state.pool,
        &ctx.tenant,
        &uuid::Uuid::new_v4().to_string(),
        &BadgeWrite {
            name,
            image_url: input.image_url.trim(),
            sort_order: input.sort_order.unwrap_or(0),
            is_active: input.is_active.unwrap_or(true),
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PanelBadgeSuccess { success: true }))
}

/// Updates a badge partially: an omitted field keeps the stored value.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/badges/{badgeId}",
    operation_id = "updatePanelBadge",
    tag = "panel",
    request_body = UpdateBadgeInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("badgeId" = String, Path, description = "The badge to update.")
    ),
    responses(
        (status = 200, body = PanelBadgeSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_badge(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, badge_id)): Path<(String, String)>,
    Json(input): Json<UpdateBadgeInput>,
) -> Result<Json<PanelBadgeSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let Some(stored) = badge_read(&state.pool, &ctx.tenant, &badge_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let name = input.name.as_deref().unwrap_or(&stored.name).trim();

    if name != stored.name
        && badge_name_taken(&state.pool, &ctx.tenant, name)
            .await
            .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    badge_update(
        &state.pool,
        &ctx.tenant,
        &badge_id,
        &BadgeWrite {
            name,
            image_url: input
                .image_url
                .as_deref()
                .unwrap_or(&stored.image_url)
                .trim(),
            sort_order: input.sort_order.unwrap_or(stored.sort_order),
            is_active: input.is_active.unwrap_or(stored.is_active),
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PanelBadgeSuccess { success: true }))
}

/// Deletes a badge; its product links cascade with it.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/badges/{badgeId}",
    operation_id = "deletePanelBadge",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("badgeId" = String, Path, description = "The badge to delete.")
    ),
    responses(
        (status = 200, body = PanelBadgeSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_badge(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, badge_id)): Path<(String, String)>,
) -> Result<Json<PanelBadgeSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    if badge_read(&state.pool, &ctx.tenant, &badge_id)
        .await
        .map_err(db_error)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }

    badge_delete(&state.pool, &ctx.tenant, &badge_id)
        .await
        .map_err(db_error)?;

    Ok(Json(PanelBadgeSuccess { success: true }))
}
