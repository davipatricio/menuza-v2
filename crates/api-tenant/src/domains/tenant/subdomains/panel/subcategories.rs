//! subcategories resource: panel routes.
//!
//! A subcategory lives inside one category and holds the products, so a write
//! verifies the category belongs to the store and a delete refuses while a
//! product still hangs off it.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::subcategories::{
    ListSubcategoriesQuery, PanelSubcategoriesOutput, PanelSubcategory, PanelSubcategorySuccess,
    SubcategoryInput,
};
use persistence::tenant::panel::subcategories::{
    SubcategoryFilter, SubcategoryWrite, subcategory_category_exists, subcategory_create,
    subcategory_delete, subcategory_list, subcategory_name_taken, subcategory_read,
    subcategory_update,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/subcategories",
            axum::routing::get(list_subcategories).post(create_subcategory),
        )
        .route(
            "/panel/stores/{storeSlug}/subcategories/{subcategoryId}",
            axum::routing::put(update_subcategory).delete(delete_subcategory),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            list_subcategories,
            create_subcategory,
            update_subcategory,
            delete_subcategory
        ),
        components(schemas(
            contract::tenant::panel::subcategories::SubcategoryInput,
            contract::tenant::panel::subcategories::PanelSubcategory,
            contract::tenant::panel::subcategories::PanelSubcategoriesOutput,
            contract::tenant::panel::subcategories::PanelSubcategorySuccess
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Subcategories with their category name and item counts.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/subcategories",
    operation_id = "listPanelSubcategories",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("q" = Option<String>, Query, description = "Name fragment; empty lists every subcategory."),
        ("status" = Option<String>, Query, description = "`all`, `active` or `inactive`."),
        ("categoryId" = Option<String>, Query, description = "Only subcategories of this category."),
        ("sortBy" = Option<String>, Query, description = "`sortOrder`, `name`, `itemsCount` or `updatedAt`."),
        ("order" = Option<String>, Query, description = "`asc` or `desc`.")
    ),
    responses(
        (status = 200, body = PanelSubcategoriesOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_subcategories(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<ListSubcategoriesQuery>,
) -> Result<Json<PanelSubcategoriesOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let filter = SubcategoryFilter {
        term: query.q.as_deref().unwrap_or("").trim(),
        status: query.status.as_deref().unwrap_or(""),
        category_id: query.category_id.as_deref().unwrap_or(""),
        sort_by: query.sort_by.as_deref().unwrap_or(""),
        order: query.order.as_deref().unwrap_or(""),
    };

    let rows = subcategory_list(&state.pool, &ctx.tenant, &filter)
        .await
        .map_err(db_error)?;

    let subcategories = rows
        .into_iter()
        .map(|row| PanelSubcategory {
            id: row.id,
            name: row.name,
            category_id: row.category_id,
            category_name: row.category_name,
            active: row.active,
            sort_order: row.sort_order,
            items_count: row.items_count,
            updated_at: iso(row.updated_at),
        })
        .collect();

    Ok(Json(PanelSubcategoriesOutput { subcategories }))
}

/// Creates a subcategory inside a category of the store.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/subcategories",
    operation_id = "createPanelSubcategory",
    tag = "panel",
    request_body = SubcategoryInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelSubcategorySuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_subcategory(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<SubcategoryInput>,
) -> Result<Json<PanelSubcategorySuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    if !subcategory_category_exists(&state.pool, &ctx.tenant, &input.category_id)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError::not_found());
    }

    let name = input.name.trim();

    if subcategory_name_taken(&state.pool, &ctx.tenant, &input.category_id, name, None)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    subcategory_create(
        &state.pool,
        &ctx.tenant,
        &uuid::Uuid::new_v4().to_string(),
        &SubcategoryWrite {
            name,
            category_id: &input.category_id,
            sort_order: input.sort_order,
            active: input.active,
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PanelSubcategorySuccess { success: true }))
}

/// Replaces every field of the subcategory, including its category.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/subcategories/{subcategoryId}",
    operation_id = "updatePanelSubcategory",
    tag = "panel",
    request_body = SubcategoryInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("subcategoryId" = String, Path, description = "The subcategory to replace.")
    ),
    responses(
        (status = 200, body = PanelSubcategorySuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_subcategory(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, subcategory_id)): Path<(String, String)>,
    Json(input): Json<SubcategoryInput>,
) -> Result<Json<PanelSubcategorySuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let Some(stored) = subcategory_read(&state.pool, &ctx.tenant, &subcategory_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    if !subcategory_category_exists(&state.pool, &ctx.tenant, &input.category_id)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError::not_found());
    }

    let name = input.name.trim();

    if (name != stored.name || input.category_id != stored.category_id)
        && subcategory_name_taken(
            &state.pool,
            &ctx.tenant,
            &input.category_id,
            name,
            Some(&subcategory_id),
        )
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    subcategory_update(
        &state.pool,
        &ctx.tenant,
        &subcategory_id,
        &SubcategoryWrite {
            name,
            category_id: &input.category_id,
            sort_order: input.sort_order,
            active: input.active,
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PanelSubcategorySuccess { success: true }))
}

/// Deletes a subcategory without products.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/subcategories/{subcategoryId}",
    operation_id = "deletePanelSubcategory",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("subcategoryId" = String, Path, description = "The subcategory to delete.")
    ),
    responses(
        (status = 200, body = PanelSubcategorySuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_subcategory(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, subcategory_id)): Path<(String, String)>,
) -> Result<Json<PanelSubcategorySuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    if subcategory_read(&state.pool, &ctx.tenant, &subcategory_id)
        .await
        .map_err(db_error)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }

    let deleted = subcategory_delete(&state.pool, &ctx.tenant, &subcategory_id)
        .await
        .map_err(db_error)?;

    if !deleted {
        return Err(ApiError(ErrorCode::Conflict));
    }

    Ok(Json(PanelSubcategorySuccess { success: true }))
}
