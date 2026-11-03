//! categories resource: panel routes.
//!
//! A category is written whole — name, order, active flag and department set —
//! and every write checks the departments belong to the store before the row is
//! touched. Deleting one with products in its subcategories is a conflict.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::categories::{
    CategoryInput, ListCategoriesQuery, PanelCategoriesOutput, PanelCategory, PanelCategorySuccess,
};
use persistence::tenant::panel::categories::{
    CategoryFilter, CategoryRow, CategoryWrite, category_create, category_delete,
    category_departments, category_list, category_name, category_name_taken, category_update,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/categories",
            axum::routing::get(list_categories).post(create_category),
        )
        .route(
            "/panel/stores/{storeSlug}/categories/{categoryId}",
            axum::routing::put(update_category).delete(delete_category),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(list_categories, create_category, update_category, delete_category),
        components(schemas(
            contract::tenant::panel::categories::CategoryInput,
            contract::tenant::panel::categories::PanelCategory,
            contract::tenant::panel::categories::PanelCategoriesOutput,
            contract::tenant::panel::categories::PanelCategorySuccess
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Categories with their item counts and department links.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/categories",
    operation_id = "listPanelCategories",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("q" = Option<String>, Query, description = "Name fragment; empty lists every category."),
        ("status" = Option<String>, Query, description = "`all`, `active` or `inactive`."),
        ("departmentId" = Option<String>, Query, description = "Only categories linked to this department."),
        ("sortBy" = Option<String>, Query, description = "`sortOrder`, `name`, `itemsCount` or `updatedAt`."),
        ("order" = Option<String>, Query, description = "`asc` or `desc`.")
    ),
    responses(
        (status = 200, body = PanelCategoriesOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_categories(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<ListCategoriesQuery>,
) -> Result<Json<PanelCategoriesOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let filter = CategoryFilter {
        term: query.q.as_deref().unwrap_or("").trim(),
        status: query.status.as_deref().unwrap_or(""),
        department_id: query.department_id.as_deref().unwrap_or(""),
        sort_by: query.sort_by.as_deref().unwrap_or(""),
        order: query.order.as_deref().unwrap_or(""),
    };

    let rows = category_list(&state.pool, &ctx.tenant, &filter)
        .await
        .map_err(db_error)?;

    let links = category_departments(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let mut department_ids: HashMap<String, Vec<String>> = HashMap::new();
    let mut department_names: HashMap<String, Vec<String>> = HashMap::new();

    for link in links {
        department_ids
            .entry(link.category_id.clone())
            .or_default()
            .push(link.department_id);
        department_names
            .entry(link.category_id)
            .or_default()
            .push(link.department_name);
    }

    let categories = rows
        .into_iter()
        .map(|row| {
            let id = row.id.clone();

            panel_category(
                row,
                department_ids.remove(&id).unwrap_or_default(),
                department_names.remove(&id).unwrap_or_default(),
            )
        })
        .collect();

    Ok(Json(PanelCategoriesOutput { categories }))
}

/// The row as the categories table reads it.
/// MCP reuses this: the tool maps the same category rows.
pub(crate) fn panel_category(
    row: CategoryRow,
    department_ids: Vec<String>,
    department_names: Vec<String>,
) -> PanelCategory {
    PanelCategory {
        id: row.id.clone(),
        name: row.name,
        active: row.active,
        sort_order: row.sort_order,
        items_count: row.items_count,
        updated_at: iso(row.updated_at),
        department_ids,
        department_names,
    }
}

/// Creates a category, its department links and its `Geral` subcategory.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/categories",
    operation_id = "createPanelCategory",
    tag = "panel",
    request_body = CategoryInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelCategorySuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_category(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<CategoryInput>,
) -> Result<Json<PanelCategorySuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let name = input.name.trim();

    if category_name_taken(&state.pool, &ctx.tenant, name)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let created = category_create(
        &state.pool,
        &ctx.tenant,
        &uuid::Uuid::new_v4().to_string(),
        &CategoryWrite {
            name,
            sort_order: input.sort_order,
            active: input.active,
            department_ids: &input.department_ids,
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    if !created {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelCategorySuccess { success: true }))
}

/// Replaces every field of the category and its whole department set.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/categories/{categoryId}",
    operation_id = "updatePanelCategory",
    tag = "panel",
    request_body = CategoryInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("categoryId" = String, Path, description = "The category to replace.")
    ),
    responses(
        (status = 200, body = PanelCategorySuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_category(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, category_id)): Path<(String, String)>,
    Json(input): Json<CategoryInput>,
) -> Result<Json<PanelCategorySuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let Some(stored_name) = category_name(&state.pool, &ctx.tenant, &category_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let name = input.name.trim();

    if name != stored_name
        && category_name_taken(&state.pool, &ctx.tenant, name)
            .await
            .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let updated = category_update(
        &state.pool,
        &ctx.tenant,
        &category_id,
        &CategoryWrite {
            name,
            sort_order: input.sort_order,
            active: input.active,
            department_ids: &input.department_ids,
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    if !updated {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelCategorySuccess { success: true }))
}

/// Deletes a category without products; its subcategories cascade with it.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/categories/{categoryId}",
    operation_id = "deletePanelCategory",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("categoryId" = String, Path, description = "The category to delete.")
    ),
    responses(
        (status = 200, body = PanelCategorySuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_category(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, category_id)): Path<(String, String)>,
) -> Result<Json<PanelCategorySuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    if category_name(&state.pool, &ctx.tenant, &category_id)
        .await
        .map_err(db_error)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }

    let deleted = category_delete(&state.pool, &ctx.tenant, &category_id)
        .await
        .map_err(db_error)?;

    if !deleted {
        return Err(ApiError(ErrorCode::Conflict));
    }

    Ok(Json(PanelCategorySuccess { success: true }))
}
