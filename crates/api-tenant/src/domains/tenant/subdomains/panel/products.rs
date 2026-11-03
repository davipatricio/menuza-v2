//! products resource: panel routes.
//!
//! Money and stock live on the variation, so the list row derives the price
//! window and the stock summary from the joined rows. Writes are partial: an
//! omitted field keeps its stored value, variations are matched by id, and a
//! variation a kit or an order still points at is a `CONFLICT` instead of a
//! cascade. The nutrition label is merged onto the stored row before both the
//! cross-field rules and the publish checklist run.

use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::products::{
    BulkDeleteProductsInput, BulkUpdateProductsInput, CreateProductInput, ListProductsQuery,
    PanelBulkDeleteOutput, PanelBulkSkipped, PanelBulkUpdateOutput, PanelProductDetail,
    PanelProductList, PanelProductNutrition, PanelProductOutput, PanelProductSuccess,
    PanelProductTag, PanelProductVariation, PanelProductsOutput, ProductBadgeRef, SORT_FIELDS,
    SaveProductNutritionInput, UpdateProductInput,
};
use persistence::tenant::panel::products::{
    NutritionRow, NutritionWrite, ProductBulkOutcome, ProductDeleteOutcome, ProductDetailRow,
    ProductFilter, ProductRow, ProductSeoRow, ProductTagRow, ProductWrite, ProductWriteOutcome,
    SkippedProduct, SubcategoryLink, VariationWrite, product_badges, product_bulk_delete,
    product_bulk_update, product_create, product_delete, product_departments, product_detail,
    product_list, product_nutrition, product_nutrition_save, product_row, product_seo,
    product_subcategories, product_tags, product_update, product_variations,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/products",
            axum::routing::get(list_products).post(create_product),
        )
        .route(
            "/panel/stores/{storeSlug}/products/bulk",
            axum::routing::post(bulk_update_products),
        )
        .route(
            "/panel/stores/{storeSlug}/products/bulk-delete",
            axum::routing::post(bulk_delete_products),
        )
        .route(
            "/panel/stores/{storeSlug}/products/{productId}",
            axum::routing::get(get_product)
                .put(update_product)
                .delete(delete_product),
        )
        .route(
            "/panel/stores/{storeSlug}/products/{productId}/nutrition",
            axum::routing::put(save_product_nutrition),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            list_products,
            create_product,
            bulk_update_products,
            bulk_delete_products,
            get_product,
            update_product,
            delete_product,
            save_product_nutrition
        ),
        components(schemas(
            contract::tenant::panel::products::PanelProduct,
            contract::tenant::panel::products::PanelProductTag,
            contract::tenant::panel::products::ProductBadgeRef,
            contract::tenant::panel::products::PanelProductList,
            contract::tenant::panel::products::PanelProductVariation,
            contract::tenant::panel::products::PanelProductNutrition,
            contract::tenant::panel::products::PanelProductDetail,
            contract::tenant::panel::products::PanelProductsOutput,
            contract::tenant::panel::products::PanelProductOutput,
            contract::tenant::panel::products::PanelProductSuccess,
            contract::tenant::panel::products::PanelBulkUpdateOutput,
            contract::tenant::panel::products::PanelBulkSkipped,
            contract::tenant::panel::products::PanelBulkDeleteOutput,
            contract::tenant::panel::products::ProductVariationInput,
            contract::tenant::panel::products::CreateProductInput,
            contract::tenant::panel::products::UpdateProductInput,
            contract::tenant::panel::products::SaveProductNutritionInput,
            contract::tenant::panel::products::BulkUpdateProductsInput,
            contract::tenant::panel::products::BulkDeleteProductsInput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The store's catalog, sorted the way the table asked.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/products",
    operation_id = "listPanelProducts",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("sortBy" = Option<String>, Query, description = "`sortOrder`, `name`, `updatedAt`, `price`, `category` or `stock`."),
        ("order" = Option<String>, Query, description = "`asc` or `desc`; nulls sort last either way.")
    ),
    responses(
        (status = 200, body = PanelProductsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_products(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<ListProductsQuery>,
) -> Result<Json<PanelProductsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let sort_by = query.sort_by.as_deref().unwrap_or("sortOrder");
    let order = query.order.as_deref().unwrap_or("asc");

    if !SORT_FIELDS.contains(&sort_by) || !matches!(order, "asc" | "desc") {
        return Err(ApiError(ErrorCode::ValidationFailed));
    }

    let filter = ProductFilter { sort_by, order };
    let desc = order == "desc";

    let rows = product_list(&state.pool, &ctx.tenant, &filter)
        .await
        .map_err(db_error)?;

    let mut variations = group_variations(
        product_variations(&state.pool, &ctx.tenant)
            .await
            .map_err(db_error)?,
    );

    let mut tags = group_tags(
        product_tags(&state.pool, &ctx.tenant)
            .await
            .map_err(db_error)?,
    );

    let mut badges = group_badges(
        product_badges(&state.pool, &ctx.tenant)
            .await
            .map_err(db_error)?,
    );

    let subcategories: HashMap<String, SubcategoryLink> =
        product_subcategories(&state.pool, &ctx.tenant)
            .await
            .map_err(db_error)?
            .into_iter()
            .map(|link| (link.subcategory_id.clone(), link))
            .collect();

    let mut departments: HashMap<String, Vec<(String, String)>> = HashMap::new();

    for link in product_departments(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?
    {
        departments
            .entry(link.category_id)
            .or_default()
            .push((link.department_id, link.department_name));
    }

    let seo: HashMap<String, ProductSeoRow> = product_seo(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|row| (row.entity_id.clone(), row))
        .collect();

    let mut products = rows
        .into_iter()
        .map(|row| {
            let id = row.id.clone();

            list_row(
                row,
                variations.remove(&id).unwrap_or_default(),
                tags.remove(&id).unwrap_or_default(),
                badges.remove(&id).unwrap_or_default(),
                &subcategories,
                &departments,
                seo.get(&id),
            )
        })
        .collect::<Vec<_>>();

    match sort_by {
        "price" => products.sort_by(|a, b| {
            cmp_number(a.price_min_cents, b.price_min_cents, desc)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.id.cmp(&b.id))
        }),
        "category" => products.sort_by(|a, b| {
            cmp_text(a.category_name.as_deref(), b.category_name.as_deref(), desc)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.id.cmp(&b.id))
        }),
        "stock" => products.sort_by(|a, b| {
            cmp_number(a.stock_qty, b.stock_qty, desc)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.id.cmp(&b.id))
        }),
        _ => {}
    }

    Ok(Json(PanelProductsOutput { products }))
}

/// The editor's read: the product, its variations and its tags.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/products/{productId}",
    operation_id = "getPanelProduct",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("productId" = String, Path, description = "The product to read.")
    ),
    responses(
        (status = 200, body = PanelProductOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_product(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, product_id)): Path<(String, String)>,
) -> Result<Json<PanelProductOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let Some(row) = product_detail(&state.pool, &ctx.tenant, &product_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    Ok(Json(PanelProductOutput {
        product: to_detail(row),
    }))
}

/// Creates the product, its variations and its tag and badge links in one
/// transaction.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/products",
    operation_id = "createPanelProduct",
    tag = "panel",
    request_body = CreateProductInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelProductOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_product(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<CreateProductInput>,
) -> Result<Json<PanelProductOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let variations = input
        .variations
        .iter()
        .map(|variation| VariationWrite {
            id: variation.id.as_deref(),
            name: variation.name.trim(),
            price_cents: variation.price_cents,
            stock_mode: variation.stock_mode.as_str(),
            stock_qty: variation.stock_qty,
        })
        .collect::<Vec<_>>();

    let product_id = uuid::Uuid::new_v4().to_string();

    let outcome = product_create(
        &state.pool,
        &ctx.tenant,
        &product_id,
        &ProductWrite {
            name: input.name.trim(),
            description: input.description.as_deref(),
            subcategory_id: input.subcategory_id.as_deref(),
            available: input.available,
            archived: input.archived.unwrap_or(false),
            hidden: input.hidden.unwrap_or(false),
            private: input.private.unwrap_or(false),
            sort_order: input.sort_order,
        },
        &variations,
        &input.tag_ids,
        input.badge_ids.as_deref().unwrap_or(&[]),
        now(),
    )
    .await
    .map_err(db_error)?;

    if outcome == ProductWriteOutcome::MissingReference {
        return Err(ApiError::not_found());
    }

    detail_response(&state, &ctx.tenant, &product_id).await
}

/// A partial update: only the fields present are written, variations are
/// matched by id, and tags and badges are replaced only when sent.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/products/{productId}",
    operation_id = "updatePanelProduct",
    tag = "panel",
    request_body = UpdateProductInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("productId" = String, Path, description = "The product to update.")
    ),
    responses(
        (status = 200, body = PanelProductOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_product(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, product_id)): Path<(String, String)>,
    Json(input): Json<UpdateProductInput>,
) -> Result<Json<PanelProductOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let Some(existing) = product_detail(&state.pool, &ctx.tenant, &product_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let existing_ids: HashSet<String> = existing
        .variations
        .iter()
        .map(|variation| variation.id.clone())
        .collect();

    let mut removed_ids = Vec::new();

    if let Some(variations) = &input.variations {
        let kept = variations
            .iter()
            .filter_map(|variation| variation.id.as_deref())
            .collect::<HashSet<_>>();

        for id in &kept {
            if !existing_ids.contains(*id) {
                return Err(ApiError::not_found());
            }
        }

        removed_ids = existing_ids
            .iter()
            .filter(|id| !kept.contains(id.as_str()))
            .cloned()
            .collect();
    }

    let variations = input.variations.as_ref().map(|list| {
        list.iter()
            .map(|variation| VariationWrite {
                id: variation.id.as_deref(),
                name: variation.name.trim(),
                price_cents: variation.price_cents,
                stock_mode: variation.stock_mode.as_str(),
                stock_qty: variation.stock_qty,
            })
            .collect::<Vec<_>>()
    });

    let outcome = product_update(
        &state.pool,
        &ctx.tenant,
        &product_id,
        &ProductWrite {
            name: input
                .name
                .as_deref()
                .unwrap_or(&existing.product.name)
                .trim(),
            description: match &input.description {
                Some(value) => value.as_deref(),
                None => existing.product.description.as_deref(),
            },
            subcategory_id: match &input.subcategory_id {
                Some(value) => value.as_deref(),
                None => existing.product.subcategory_id.as_deref(),
            },
            available: input.available.unwrap_or(existing.product.available),
            archived: input.archived.unwrap_or(existing.product.archived),
            hidden: input.hidden.unwrap_or(existing.product.hidden),
            private: input.private.unwrap_or(existing.product.private),
            sort_order: input.sort_order.unwrap_or(existing.product.sort_order),
        },
        variations.as_deref(),
        &removed_ids,
        input.tag_ids.as_deref(),
        input.badge_ids.as_deref(),
        now(),
    )
    .await
    .map_err(db_error)?;

    match outcome {
        ProductWriteOutcome::Updated => {}
        ProductWriteOutcome::MissingReference => return Err(ApiError::not_found()),
        ProductWriteOutcome::VariationInUse => return Err(ApiError(ErrorCode::Conflict)),
    }

    detail_response(&state, &ctx.tenant, &product_id).await
}

/// Deletes a product no order or kit points at.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/products/{productId}",
    operation_id = "deletePanelProduct",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("productId" = String, Path, description = "The product to delete.")
    ),
    responses(
        (status = 200, body = PanelProductSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_product(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, product_id)): Path<(String, String)>,
) -> Result<Json<PanelProductSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    match product_delete(&state.pool, &ctx.tenant, &product_id)
        .await
        .map_err(db_error)?
    {
        ProductDeleteOutcome::Deleted => Ok(Json(PanelProductSuccess { success: true })),
        ProductDeleteOutcome::Missing => Err(ApiError::not_found()),
        ProductDeleteOutcome::InUse => Err(ApiError(ErrorCode::Conflict)),
    }
}

/// Applies one patch to the selection, all-or-nothing on ownership.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/products/bulk",
    operation_id = "bulkUpdatePanelProducts",
    tag = "panel",
    request_body = BulkUpdateProductsInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelBulkUpdateOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn bulk_update_products(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<BulkUpdateProductsInput>,
) -> Result<Json<PanelBulkUpdateOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let product_ids = distinct(&input.product_ids);

    let outcome = product_bulk_update(
        &state.pool,
        &ctx.tenant,
        &product_ids,
        input.available,
        input.subcategory_id.as_ref().map(|value| value.as_deref()),
        input.add_tag_ids.as_deref(),
        now(),
    )
    .await
    .map_err(db_error)?;

    if outcome == ProductBulkOutcome::MissingReference {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelBulkUpdateOutput {
        updated: product_ids.len() as i64,
    }))
}

/// Deletes the deletable part of the selection and reports the rest.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/products/bulk-delete",
    operation_id = "bulkDeletePanelProducts",
    tag = "panel",
    request_body = BulkDeleteProductsInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelBulkDeleteOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn bulk_delete_products(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<BulkDeleteProductsInput>,
) -> Result<Json<PanelBulkDeleteOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let product_ids = distinct(&input.product_ids);

    let result = product_bulk_delete(&state.pool, &ctx.tenant, &product_ids)
        .await
        .map_err(db_error)?;

    let skipped = result
        .skipped
        .into_iter()
        .map(|SkippedProduct { id, name }| PanelBulkSkipped { id, name })
        .collect();

    Ok(Json(PanelBulkDeleteOutput {
        deleted: result.deleted,
        skipped,
    }))
}

/// Merges a partial label onto the stored row, validates the result and
/// returns the detail the editor re-renders.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/products/{productId}/nutrition",
    operation_id = "savePanelProductNutrition",
    tag = "panel",
    request_body = SaveProductNutritionInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("productId" = String, Path, description = "The product whose label is saved.")
    ),
    responses(
        (status = 200, body = PanelProductOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn save_product_nutrition(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, product_id)): Path<(String, String)>,
    Json(input): Json<SaveProductNutritionInput>,
) -> Result<Json<PanelProductOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    if product_row(&state.pool, &ctx.tenant, &product_id)
        .await
        .map_err(db_error)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }

    let existing = product_nutrition(&state.pool, &ctx.tenant, &product_id)
        .await
        .map_err(db_error)?;

    let basis = input
        .basis
        .clone()
        .or_else(|| existing.as_ref().map(|row| row.basis.clone()))
        .unwrap_or_else(|| "solid".to_owned());
    let label_format = input
        .label_format
        .clone()
        .or_else(|| existing.as_ref().map(|row| row.label_format.clone()))
        .unwrap_or_else(|| "vertical".to_owned());
    let source = input
        .source
        .clone()
        .or_else(|| existing.as_ref().map(|row| row.source.clone()))
        .unwrap_or_else(|| "manual".to_owned());

    let reference_at = match &input.reference_at {
        Some(None) => None,
        Some(Some(value)) => Some(
            chrono::DateTime::parse_from_rfc3339(value)
                .map_err(|_| ApiError(ErrorCode::ValidationFailed))?
                .naive_utc(),
        ),
        None => existing.as_ref().and_then(|row| row.reference_at),
    };

    let household_measure = pick_nullable(
        &input.household_measure,
        existing
            .as_ref()
            .and_then(|row| row.household_measure.clone()),
    );
    let notes = pick_nullable(
        &input.notes,
        existing.as_ref().and_then(|row| row.notes.clone()),
    );

    let write = NutritionWrite {
        basis: &basis,
        label_format: &label_format,
        source: &source,
        reference_at,
        energy_kcal: pick(
            input.energy_kcal,
            existing.as_ref().and_then(|row| row.energy_kcal),
        ),
        carbs_mg: pick(
            input.carbs_mg,
            existing.as_ref().and_then(|row| row.carbs_mg),
        ),
        total_sugars_mg: pick(
            input.total_sugars_mg,
            existing.as_ref().and_then(|row| row.total_sugars_mg),
        ),
        added_sugars_mg: pick(
            input.added_sugars_mg,
            existing.as_ref().and_then(|row| row.added_sugars_mg),
        ),
        protein_mg: pick(
            input.protein_mg,
            existing.as_ref().and_then(|row| row.protein_mg),
        ),
        total_fat_mg: pick(
            input.total_fat_mg,
            existing.as_ref().and_then(|row| row.total_fat_mg),
        ),
        saturated_fat_mg: pick(
            input.saturated_fat_mg,
            existing.as_ref().and_then(|row| row.saturated_fat_mg),
        ),
        trans_fat_mg: pick(
            input.trans_fat_mg,
            existing.as_ref().and_then(|row| row.trans_fat_mg),
        ),
        fiber_mg: pick(
            input.fiber_mg,
            existing.as_ref().and_then(|row| row.fiber_mg),
        ),
        sodium_mg: pick(
            input.sodium_mg,
            existing.as_ref().and_then(|row| row.sodium_mg),
        ),
        portion_milli: pick(
            input.portion_milli,
            existing.as_ref().and_then(|row| row.portion_milli),
        ),
        household_measure: household_measure.as_deref(),
        servings_per_pack: pick(
            input.servings_per_pack,
            existing.as_ref().and_then(|row| row.servings_per_pack),
        ),
        show_high_added_sugar: input.show_high_added_sugar.unwrap_or_else(|| {
            existing
                .as_ref()
                .is_some_and(|row| row.show_high_added_sugar)
        }),
        show_high_sat_fat: input
            .show_high_sat_fat
            .unwrap_or_else(|| existing.as_ref().is_some_and(|row| row.show_high_sat_fat)),
        show_high_sodium: input
            .show_high_sodium
            .unwrap_or_else(|| existing.as_ref().is_some_and(|row| row.show_high_sodium)),
        published: input
            .published
            .unwrap_or_else(|| existing.as_ref().is_some_and(|row| row.published)),
        notes: notes.as_deref(),
    };

    assert_consistent(&write)?;
    assert_publishable(&write)?;

    product_nutrition_save(
        &state.pool,
        &ctx.tenant,
        &product_id,
        &uuid::Uuid::new_v4().to_string(),
        &write,
        now(),
    )
    .await
    .map_err(db_error)?;

    detail_response(&state, &ctx.tenant, &product_id).await
}

/// Loads the detail a write answers with.
async fn detail_response(
    state: &crate::State,
    tenant: &persistence::tenant::TenantId,
    product_id: &str,
) -> Result<Json<PanelProductOutput>, ApiError> {
    let Some(row) = product_detail(&state.pool, tenant, product_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    Ok(Json(PanelProductOutput {
        product: to_detail(row),
    }))
}

/// The 100 g/mL ordering rules, applied to the merged row.
fn assert_consistent(write: &NutritionWrite<'_>) -> Result<(), ApiError> {
    if let (Some(added), Some(total)) = (write.added_sugars_mg, write.total_sugars_mg)
        && added > total
    {
        return Err(ApiError(ErrorCode::ValidationFailed));
    }

    if let (Some(saturated), Some(trans), Some(total)) = (
        write.saturated_fat_mg,
        write.trans_fat_mg,
        write.total_fat_mg,
    ) && saturated.saturating_add(trans) > total
    {
        return Err(ApiError(ErrorCode::ValidationFailed));
    }

    Ok(())
}

/// A published label must be complete: the checklist is judged on the merged
/// row, never on the patch alone.
fn assert_publishable(write: &NutritionWrite<'_>) -> Result<(), ApiError> {
    if !write.published {
        return Ok(());
    }

    let nutrients = [
        write.energy_kcal,
        write.carbs_mg,
        write.total_sugars_mg,
        write.added_sugars_mg,
        write.protein_mg,
        write.total_fat_mg,
        write.saturated_fat_mg,
        write.trans_fat_mg,
        write.fiber_mg,
        write.sodium_mg,
    ];

    let complete = nutrients.iter().all(Option::is_some)
        && write.portion_milli.is_some_and(|value| value > 0)
        && write.servings_per_pack.is_some_and(|value| value > 0)
        && write
            .household_measure
            .is_some_and(|value| !value.trim().is_empty());

    if complete {
        Ok(())
    } else {
        Err(ApiError(ErrorCode::ValidationFailed))
    }
}

/// One list row, with its taxonomy, tags, badges and price window.
/// MCP reuses this: the tool calls the same persistence queries and this mapper.
pub(crate) fn list_row(
    row: ProductRow,
    variations: Vec<persistence::tenant::panel::products::VariationRow>,
    tags: Vec<ProductTagRow>,
    badges: Vec<persistence::tenant::panel::products::ProductBadgeRow>,
    subcategories: &HashMap<String, SubcategoryLink>,
    departments: &HashMap<String, Vec<(String, String)>>,
    seo: Option<&ProductSeoRow>,
) -> PanelProductList {
    let subcategory = row
        .subcategory_id
        .as_ref()
        .and_then(|id| subcategories.get(id));

    let department_links = subcategory
        .and_then(|link| departments.get(&link.category_id))
        .cloned()
        .unwrap_or_default();

    let prices = variations
        .iter()
        .map(|variation| variation.price_cents)
        .collect::<Vec<_>>();

    let controlled = variations
        .iter()
        .filter(|variation| variation.stock_mode == "controlled")
        .collect::<Vec<_>>();

    let stock_qty = if controlled.is_empty() {
        None
    } else {
        Some(
            controlled
                .iter()
                .map(|variation| variation.stock_qty.unwrap_or(0))
                .sum(),
        )
    };

    let price_cents = variations
        .iter()
        .find(|variation| variation.name == "default")
        .map(|variation| variation.price_cents)
        .or_else(|| variations.first().map(|variation| variation.price_cents));

    PanelProductList {
        id: row.id,
        name: row.name,
        description: row.description,
        seo_title: seo.and_then(|row| row.title.clone()),
        seo_description: seo.and_then(|row| row.description.clone()),
        variation_names: variations
            .iter()
            .map(|variation| variation.name.clone())
            .collect(),
        variation_count: variations.len() as i32,
        category_id: subcategory.map(|link| link.category_id.clone()),
        category_name: subcategory.map(|link| link.category_name.clone()),
        subcategory_id: subcategory.map(|link| link.subcategory_id.clone()),
        subcategory_name: subcategory.map(|link| link.subcategory_name.clone()),
        department_ids: department_links.iter().map(|(id, _)| id.clone()).collect(),
        department_names: department_links
            .iter()
            .map(|(_, name)| name.clone())
            .collect(),
        tags: tags.iter().map(tag_out).collect(),
        badges: badges.iter().map(badge_out).collect(),
        price_cents,
        price_min_cents: prices.iter().min().copied(),
        price_max_cents: prices.iter().max().copied(),
        stock_qty,
        has_unlimited_stock: variations
            .iter()
            .any(|variation| variation.stock_mode == "unlimited"),
        available: row.available,
        archived: row.archived,
        hidden: row.hidden,
        private: row.private,
        sort_order: row.sort_order,
        updated_at: iso(row.updated_at),
    }
}

/// The detail shape, in the contract's field order.
/// MCP reuses this: the tool calls the same persistence query and this mapper.
pub(crate) fn to_detail(row: ProductDetailRow) -> PanelProductDetail {
    let variations = row
        .variations
        .iter()
        .map(|variation| PanelProductVariation {
            id: variation.id.clone(),
            name: variation.name.clone(),
            price_cents: variation.price_cents,
            stock_mode: variation.stock_mode.clone(),
            stock_qty: variation.stock_qty,
        })
        .collect::<Vec<_>>();

    let price_cents = variations
        .iter()
        .find(|variation| variation.name == "default")
        .map(|variation| variation.price_cents)
        .or_else(|| variations.first().map(|variation| variation.price_cents));

    PanelProductDetail {
        id: row.product.id,
        name: row.product.name,
        description: row.product.description,
        category_id: row
            .subcategory
            .as_ref()
            .map(|link| link.category_id.clone()),
        category_name: row
            .subcategory
            .as_ref()
            .map(|link| link.category_name.clone()),
        subcategory_id: row
            .subcategory
            .as_ref()
            .map(|link| link.subcategory_id.clone()),
        subcategory_name: row
            .subcategory
            .as_ref()
            .map(|link| link.subcategory_name.clone()),
        department_ids: row
            .departments
            .iter()
            .map(|link| link.department_id.clone())
            .collect(),
        department_names: row
            .departments
            .iter()
            .map(|link| link.department_name.clone())
            .collect(),
        tags: row.tags.iter().map(tag_out).collect(),
        badges: row.badges.iter().map(badge_out).collect(),
        price_cents,
        available: row.product.available,
        archived: row.product.archived,
        hidden: row.product.hidden,
        private: row.product.private,
        sort_order: row.product.sort_order,
        updated_at: iso(row.product.updated_at),
        variations,
        nutrition: row.nutrition.as_ref().map(nutrition_out),
    }
}

fn tag_out(row: &ProductTagRow) -> PanelProductTag {
    PanelProductTag {
        id: row.tag_id.clone(),
        name: row.tag_name.clone(),
    }
}

fn badge_out(row: &persistence::tenant::panel::products::ProductBadgeRow) -> ProductBadgeRef {
    ProductBadgeRef {
        id: row.badge_id.clone(),
        name: row.badge_name.clone(),
        image_url: row.image_url.clone(),
    }
}

fn nutrition_out(row: &NutritionRow) -> PanelProductNutrition {
    PanelProductNutrition {
        basis: row.basis.clone(),
        label_format: row.label_format.clone(),
        source: row.source.clone(),
        reference_at: row.reference_at.map(iso),
        energy_kcal: row.energy_kcal,
        carbs_mg: row.carbs_mg,
        total_sugars_mg: row.total_sugars_mg,
        added_sugars_mg: row.added_sugars_mg,
        protein_mg: row.protein_mg,
        total_fat_mg: row.total_fat_mg,
        saturated_fat_mg: row.saturated_fat_mg,
        trans_fat_mg: row.trans_fat_mg,
        fiber_mg: row.fiber_mg,
        sodium_mg: row.sodium_mg,
        portion_milli: row.portion_milli,
        household_measure: row.household_measure.clone(),
        servings_per_pack: row.servings_per_pack,
        show_high_added_sugar: row.show_high_added_sugar,
        show_high_sat_fat: row.show_high_sat_fat,
        show_high_sodium: row.show_high_sodium,
        published: row.published,
        notes: row.notes.clone(),
        updated_at: iso(row.updated_at),
    }
}

/// MCP reuses this: the tool groups the same variation rows.
pub(crate) fn group_variations(
    rows: Vec<persistence::tenant::panel::products::VariationRow>,
) -> HashMap<String, Vec<persistence::tenant::panel::products::VariationRow>> {
    let mut grouped: HashMap<String, Vec<_>> = HashMap::new();

    for row in rows {
        grouped.entry(row.product_id.clone()).or_default().push(row);
    }

    grouped
}

/// MCP reuses this: the tool groups the same tag rows.
pub(crate) fn group_tags(rows: Vec<ProductTagRow>) -> HashMap<String, Vec<ProductTagRow>> {
    let mut grouped: HashMap<String, Vec<_>> = HashMap::new();

    for row in rows {
        grouped.entry(row.product_id.clone()).or_default().push(row);
    }

    grouped
}

/// MCP reuses this: the tool groups the same badge rows.
pub(crate) fn group_badges(
    rows: Vec<persistence::tenant::panel::products::ProductBadgeRow>,
) -> HashMap<String, Vec<persistence::tenant::panel::products::ProductBadgeRow>> {
    let mut grouped: HashMap<String, Vec<_>> = HashMap::new();

    for row in rows {
        grouped.entry(row.product_id.clone()).or_default().push(row);
    }

    grouped
}

/// The distinct ids of a bulk payload, in first-seen order.
fn distinct(ids: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();

    ids.iter()
        .filter(|id| seen.insert((*id).clone()))
        .cloned()
        .collect()
}

/// Nulls sort last in both directions; they mean "no value".
/// MCP reuses this: the tool sorts the same list rows.
pub(crate) fn cmp_number(a: Option<i32>, b: Option<i32>, desc: bool) -> Ordering {
    match (a, b) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(a), Some(b)) => {
            if desc {
                b.cmp(&a)
            } else {
                a.cmp(&b)
            }
        }
    }
}

/// MCP reuses this: the tool sorts the same list rows.
pub(crate) fn cmp_text(a: Option<&str>, b: Option<&str>, desc: bool) -> Ordering {
    match (a, b) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater,
        (Some(_), None) => Ordering::Less,
        (Some(a), Some(b)) => {
            if desc {
                b.cmp(a)
            } else {
                a.cmp(b)
            }
        }
    }
}

/// An omitted patch key keeps the stored value.
fn pick(patch: Option<Option<i32>>, stored: Option<i32>) -> Option<i32> {
    patch.unwrap_or(stored)
}

/// An omitted patch key keeps the stored value; a present `null` clears it.
fn pick_nullable<T: Clone>(patch: &Option<Option<T>>, stored: Option<T>) -> Option<T> {
    match patch {
        Some(value) => value.clone(),
        None => stored,
    }
}
