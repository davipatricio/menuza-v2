//! departments resource: panel routes.
//!
//! A department groups categories. Deactivating one that still holds products
//! requires a destination category, whose `Geral` subcategory receives them in
//! the same transaction.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::departments::{
    CreateDepartmentInput, ListDepartmentsQuery, PanelDepartment, PanelDepartmentSuccess,
    PanelDepartmentsOutput, UpdateDepartmentInput,
};
use persistence::tenant::panel::departments::{
    DepartmentFilter, DepartmentRow, DepartmentWrite, department_create, department_delete,
    department_list, department_name, department_name_taken, department_update,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/departments",
            axum::routing::get(list_departments).post(create_department),
        )
        .route(
            "/panel/stores/{storeSlug}/departments/{departmentId}",
            axum::routing::put(update_department).delete(delete_department),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            list_departments,
            create_department,
            update_department,
            delete_department
        ),
        components(schemas(
            contract::tenant::panel::departments::CreateDepartmentInput,
            contract::tenant::panel::departments::UpdateDepartmentInput,
            contract::tenant::panel::departments::PanelDepartment,
            contract::tenant::panel::departments::PanelDepartmentsOutput,
            contract::tenant::panel::departments::PanelDepartmentSuccess
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Departments with their item counts.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/departments",
    operation_id = "listPanelDepartments",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("q" = Option<String>, Query, description = "Name fragment; empty lists every department."),
        ("status" = Option<String>, Query, description = "`all`, `active` or `inactive`."),
        ("sortBy" = Option<String>, Query, description = "`name`, `itemsCount` or `updatedAt`."),
        ("order" = Option<String>, Query, description = "`asc` or `desc`.")
    ),
    responses(
        (status = 200, body = PanelDepartmentsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_departments(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<ListDepartmentsQuery>,
) -> Result<Json<PanelDepartmentsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let filter = DepartmentFilter {
        term: query.q.as_deref().unwrap_or("").trim(),
        status: query.status.as_deref().unwrap_or(""),
        sort_by: query.sort_by.as_deref().unwrap_or(""),
        order: query.order.as_deref().unwrap_or(""),
    };

    let rows = department_list(&state.pool, &ctx.tenant, &filter)
        .await
        .map_err(db_error)?;

    let departments = rows.into_iter().map(panel_department).collect();

    Ok(Json(PanelDepartmentsOutput { departments }))
}

/// The row as the departments table reads it.
/// MCP reuses this: the tool maps the same department rows.
pub(crate) fn panel_department(row: DepartmentRow) -> PanelDepartment {
    PanelDepartment {
        id: row.id,
        name: row.name,
        active: row.active,
        items_count: row.items_count,
        updated_at: iso(row.updated_at),
    }
}

/// Creates a department of the store.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/departments",
    operation_id = "createPanelDepartment",
    tag = "panel",
    request_body = CreateDepartmentInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelDepartmentSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_department(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<CreateDepartmentInput>,
) -> Result<Json<PanelDepartmentSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let name = input.name.trim();

    if department_name_taken(&state.pool, &ctx.tenant, name)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    department_create(
        &state.pool,
        &ctx.tenant,
        &uuid::Uuid::new_v4().to_string(),
        &DepartmentWrite {
            name,
            active: input.active,
            move_to: None,
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(PanelDepartmentSuccess { success: true }))
}

/// Renames a department and flips its active flag, moving its products when it
/// is deactivated with stock inside.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/departments/{departmentId}",
    operation_id = "updatePanelDepartment",
    tag = "panel",
    request_body = UpdateDepartmentInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("departmentId" = String, Path, description = "The department to update.")
    ),
    responses(
        (status = 200, body = PanelDepartmentSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_department(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, department_id)): Path<(String, String)>,
    Json(input): Json<UpdateDepartmentInput>,
) -> Result<Json<PanelDepartmentSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let Some(stored_name) = department_name(&state.pool, &ctx.tenant, &department_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let name = input.name.trim();

    if name != stored_name
        && department_name_taken(&state.pool, &ctx.tenant, name)
            .await
            .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let updated = department_update(
        &state.pool,
        &ctx.tenant,
        &department_id,
        &DepartmentWrite {
            name,
            active: input.active,
            move_to: input.move_products_to_category_id.as_deref(),
        },
        now(),
    )
    .await
    .map_err(db_error)?;

    if !updated {
        return Err(ApiError(ErrorCode::Conflict));
    }

    Ok(Json(PanelDepartmentSuccess { success: true }))
}

/// Deletes a department no category is linked to.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/departments/{departmentId}",
    operation_id = "deletePanelDepartment",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("departmentId" = String, Path, description = "The department to delete.")
    ),
    responses(
        (status = 200, body = PanelDepartmentSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_department(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, department_id)): Path<(String, String)>,
) -> Result<Json<PanelDepartmentSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    if department_name(&state.pool, &ctx.tenant, &department_id)
        .await
        .map_err(db_error)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }

    let deleted = department_delete(&state.pool, &ctx.tenant, &department_id)
        .await
        .map_err(db_error)?;

    if !deleted {
        return Err(ApiError(ErrorCode::Conflict));
    }

    Ok(Json(PanelDepartmentSuccess { success: true }))
}
