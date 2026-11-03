//! tags resource: panel routes.
//!
//! A tag is a name plus a visibility flag. A tag still linked to a product
//! cannot be deleted, and names are unique per store.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::tags::{
    ListTagsQuery, PanelTag, PanelTagSuccess, PanelTagsOutput, TagInput,
};
use persistence::tenant::panel::tags::{
    TagRow, tag_create, tag_delete, tag_list, tag_name, tag_name_taken, tag_update,
};

use super::support::{context, guard};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/tags",
            axum::routing::get(list_tags).post(create_tag),
        )
        .route(
            "/panel/stores/{storeSlug}/tags/{tagId}",
            axum::routing::put(update_tag).delete(delete_tag),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(list_tags, create_tag, update_tag, delete_tag),
        components(schemas(
            contract::tenant::panel::tags::TagInput,
            contract::tenant::panel::tags::PanelTag,
            contract::tenant::panel::tags::PanelTagsOutput,
            contract::tenant::panel::tags::PanelTagSuccess
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Tags with their product counts.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/tags",
    operation_id = "listPanelTags",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("sortBy" = Option<String>, Query, description = "`name` or `itemsCount`."),
        ("order" = Option<String>, Query, description = "`asc` or `desc`.")
    ),
    responses(
        (status = 200, body = PanelTagsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_tags(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<ListTagsQuery>,
) -> Result<Json<PanelTagsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = tag_list(
        &state.pool,
        &ctx.tenant,
        query.sort_by.as_deref().unwrap_or(""),
        query.order.as_deref().unwrap_or(""),
    )
    .await
    .map_err(db_error)?;

    let tags = rows.into_iter().map(panel_tag).collect();

    Ok(Json(PanelTagsOutput { tags }))
}

/// The row as the tags table reads it.
/// MCP reuses this: the tool maps the same tag rows.
pub(crate) fn panel_tag(row: TagRow) -> PanelTag {
    PanelTag {
        id: row.id,
        name: row.name,
        is_active: row.is_active,
        items_count: row.items_count,
    }
}

/// Creates a tag of the store.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/tags",
    operation_id = "createPanelTag",
    tag = "panel",
    request_body = TagInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelTagSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_tag(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<TagInput>,
) -> Result<Json<PanelTagSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let name = input.name.trim();

    if tag_name_taken(&state.pool, &ctx.tenant, name)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    tag_create(
        &state.pool,
        &ctx.tenant,
        &uuid::Uuid::new_v4().to_string(),
        name,
        input.is_active,
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PanelTagSuccess { success: true }))
}

/// Replaces the tag's name and visibility.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/tags/{tagId}",
    operation_id = "updatePanelTag",
    tag = "panel",
    request_body = TagInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("tagId" = String, Path, description = "The tag to update.")
    ),
    responses(
        (status = 200, body = PanelTagSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_tag(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, tag_id)): Path<(String, String)>,
    Json(input): Json<TagInput>,
) -> Result<Json<PanelTagSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let Some(stored_name) = tag_name(&state.pool, &ctx.tenant, &tag_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let name = input.name.trim();

    if name != stored_name
        && tag_name_taken(&state.pool, &ctx.tenant, name)
            .await
            .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    tag_update(&state.pool, &ctx.tenant, &tag_id, name, input.is_active)
        .await
        .map_err(db_error)?;

    Ok(Json(PanelTagSuccess { success: true }))
}

/// Deletes a tag no product carries.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/tags/{tagId}",
    operation_id = "deletePanelTag",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("tagId" = String, Path, description = "The tag to delete.")
    ),
    responses(
        (status = 200, body = PanelTagSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_tag(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, tag_id)): Path<(String, String)>,
) -> Result<Json<PanelTagSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    if tag_name(&state.pool, &ctx.tenant, &tag_id)
        .await
        .map_err(db_error)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }

    let deleted = tag_delete(&state.pool, &ctx.tenant, &tag_id)
        .await
        .map_err(db_error)?;

    if !deleted {
        return Err(ApiError(ErrorCode::Conflict));
    }

    Ok(Json(PanelTagSuccess { success: true }))
}
