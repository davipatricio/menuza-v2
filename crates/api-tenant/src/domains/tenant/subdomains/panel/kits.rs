//! kits resource: panel routes.
//!
//! The panel reads a kit whole and writes it whole: groups, dishes and bands
//! travel with the kit, and a write replaces the full set in one transaction.
//! A kit owns no stock — the checkout debits the variations its dishes name.
//!
//! Every write gates on `catalog:write` next to the query it protects.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::tenant::panel::kits::{
    CreateKitInput, KitGroupInput, KitItemInput, KitKind, KitPricingMode, KitUnavailableBehavior,
    PanelKit, PanelKitBand, PanelKitDetail, PanelKitGroup, PanelKitItem, PanelKitOptionProduct,
    PanelKitOptionVariation, PanelKitOptionsOutput, PanelKitOutput, PanelKitSuccess,
    PanelKitsOutput, UpdateKitInput,
};
use persistence::tenant::panel::kits::{
    KitBandWrite, KitDetail, KitGroupWrite, KitItemWrite, KitWrite, kit_archive, kit_create,
    kit_get, kit_list, kit_options, kit_references_owned, kit_update,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/kits",
            axum::routing::get(list_kits).post(create_kit),
        )
        .route(
            "/panel/stores/{storeSlug}/kits/{kitId}",
            axum::routing::get(get_kit)
                .put(update_kit)
                .delete(delete_kit),
        )
        .route(
            "/panel/stores/{storeSlug}/kit-options",
            axum::routing::get(kit_options_route),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            list_kits,
            get_kit,
            create_kit,
            update_kit,
            delete_kit,
            kit_options_route
        ),
        components(schemas(
            PanelKit,
            PanelKitDetail,
            PanelKitGroup,
            PanelKitItem,
            PanelKitBand,
            PanelKitsOutput,
            PanelKitOutput,
            PanelKitSuccess,
            PanelKitOptionsOutput,
            PanelKitOptionProduct,
            PanelKitOptionVariation,
            CreateKitInput,
            UpdateKitInput,
            KitKind,
            KitPricingMode,
            KitUnavailableBehavior
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Kits with their dish counts, ordered by `sortOrder` then name.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/kits",
    operation_id = "listPanelKits",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelKitsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_kits(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelKitsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = kit_list(&state.pool, &ctx.tenant).await.map_err(db_error)?;

    let kits = rows
        .into_iter()
        .map(|row| PanelKit {
            id: row.id,
            name: row.name,
            slug: row.slug,
            kind: kind_of(&row.kind),
            pricing_mode: pricing_mode_of(&row.pricing_mode),
            base_cents: row.base_cents,
            percent_off: row.percent_off,
            available: row.available,
            archived: row.archived,
            items_count: row.items_count,
            updated_at: iso(row.updated_at),
        })
        .collect();

    Ok(Json(PanelKitsOutput { kits }))
}

/// One kit with its groups, dishes and bands.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/kits/{kitId}",
    operation_id = "getPanelKit",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("kitId" = String, Path, description = "The kit id.")
    ),
    responses(
        (status = 200, body = PanelKitOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_kit(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, kit_id)): Path<(String, String)>,
) -> Result<Json<PanelKitOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let detail = kit_get(&state.pool, &ctx.tenant, &kit_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(PanelKitOutput {
        kit: detail_out(detail),
    }))
}

/// Creates a kit with its whole composition.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/kits",
    operation_id = "createPanelKit",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    request_body = CreateKitInput,
    responses(
        (status = 200, body = PanelKitOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_kit(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<CreateKitInput>,
) -> Result<Json<PanelKitOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let write = write_of(&input);

    if !kit_references_owned(&state.pool, &ctx.tenant, &write)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(contract::ErrorCode::ValidationFailed));
    }

    let kit_id = uuid::Uuid::new_v4().to_string();

    kit_create(&state.pool, &ctx.tenant, &kit_id, &write, now())
        .await
        .map_err(conflict_or)?;

    let detail = kit_get(&state.pool, &ctx.tenant, &kit_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(PanelKitOutput {
        kit: detail_out(detail),
    }))
}

/// Replaces a kit with its whole composition. An omitted field keeps the stored
/// value; `null` clears a nullable one.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/kits/{kitId}",
    operation_id = "updatePanelKit",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("kitId" = String, Path, description = "The kit id.")
    ),
    request_body = UpdateKitInput,
    responses(
        (status = 200, body = PanelKitOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_kit(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, kit_id)): Path<(String, String)>,
    Json(input): Json<UpdateKitInput>,
) -> Result<Json<PanelKitOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let stored = kit_get(&state.pool, &ctx.tenant, &kit_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    // The cross-field rules need the row this payload merges onto: a dish may
    // only name a group of the merged kit, and the kind decides which bounds
    // are legal. Validate the merged kit, not the patch.
    let merged = merge(&stored, &input);

    merged.validate().map_err(ApiError)?;

    let write = write_of(&merged);

    if !kit_references_owned(&state.pool, &ctx.tenant, &write)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(contract::ErrorCode::ValidationFailed));
    }

    let updated = kit_update(&state.pool, &ctx.tenant, &kit_id, &write, now())
        .await
        .map_err(conflict_or)?;

    if !updated {
        return Err(ApiError::not_found());
    }

    let detail = kit_get(&state.pool, &ctx.tenant, &kit_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(PanelKitOutput {
        kit: detail_out(detail),
    }))
}

/// Archives a kit. Dishes, groups and bands stay: an archived kit is history.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/kits/{kitId}",
    operation_id = "deletePanelKit",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("kitId" = String, Path, description = "The kit id.")
    ),
    responses(
        (status = 200, body = PanelKitSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_kit(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, kit_id)): Path<(String, String)>,
) -> Result<Json<PanelKitSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    let archived = kit_archive(&state.pool, &ctx.tenant, &kit_id, now())
        .await
        .map_err(db_error)?;

    if !archived {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelKitSuccess { success: true }))
}

/// The stored slug, narrowed. The column CHECK pins the set, so an unknown
/// value can only come from a hand edit; `fixed` is the safe reading.
fn kind_of(value: &str) -> KitKind {
    match value {
        "custom_quantities" => KitKind::CustomQuantities,
        "fixed_total" => KitKind::FixedTotal,
        _ => KitKind::Fixed,
    }
}

fn pricing_mode_of(value: &str) -> KitPricingMode {
    match value {
        "sum" => KitPricingMode::Sum,
        _ => KitPricingMode::Fixed,
    }
}

fn unavailable_behavior_of(value: &str) -> KitUnavailableBehavior {
    match value {
        "block" => KitUnavailableBehavior::Block,
        _ => KitUnavailableBehavior::Hide,
    }
}

fn kind_slug(kind: KitKind) -> &'static str {
    match kind {
        KitKind::Fixed => "fixed",
        KitKind::CustomQuantities => "custom_quantities",
        KitKind::FixedTotal => "fixed_total",
    }
}

fn pricing_mode_slug(mode: KitPricingMode) -> &'static str {
    match mode {
        KitPricingMode::Fixed => "fixed",
        KitPricingMode::Sum => "sum",
    }
}

fn unavailable_behavior_slug(behavior: KitUnavailableBehavior) -> &'static str {
    match behavior {
        KitUnavailableBehavior::Hide => "hide",
        KitUnavailableBehavior::Block => "block",
    }
}

/// The persisted row as the editor sees it.
fn detail_out(detail: KitDetail) -> PanelKitDetail {
    let swaps = detail.swaps;

    PanelKitDetail {
        id: detail.kit.id,
        name: detail.kit.name,
        slug: detail.kit.slug,
        description: detail.kit.description,
        image_url: detail.kit.image_url,
        kind: kind_of(&detail.kit.kind),
        pricing_mode: pricing_mode_of(&detail.kit.pricing_mode),
        base_cents: detail.kit.base_cents,
        percent_off: detail.kit.percent_off,
        min_items: detail.kit.min_items,
        max_items: detail.kit.max_items,
        max_kits_per_order: detail.kit.max_kits_per_order,
        unavailable_behavior: unavailable_behavior_of(&detail.kit.unavailable_behavior),
        coupon_stackable: detail.kit.coupon_stackable,
        sort_order: detail.kit.sort_order,
        available: detail.kit.available,
        archived: detail.kit.archived,
        updated_at: iso(detail.kit.updated_at),
        groups: detail
            .groups
            .into_iter()
            .map(|group| PanelKitGroup {
                id: group.id,
                name: group.name,
                min_items: group.min_items,
                max_items: group.max_items,
                sort_order: group.sort_order,
            })
            .collect(),
        items: detail
            .items
            .into_iter()
            .map(|item| PanelKitItem {
                swap_variation_ids: swaps.get(&item.id).cloned().unwrap_or_default(),
                id: item.id,
                product_id: item.product_id,
                product_name: item.product_name,
                variation_id: item.variation_id,
                variation_name: item.variation_name,
                group_id: item.group_id,
                quantity: item.quantity,
                min_qty: item.min_qty,
                max_qty: item.max_qty,
                step: item.step,
                allow_swap: item.allow_swap,
                sort_order: item.sort_order,
            })
            .collect(),
        bands: detail
            .bands
            .into_iter()
            .map(|band| PanelKitBand {
                id: band.id,
                min_quantity: band.min_quantity,
                percent: band.percent,
            })
            .collect(),
    }
}

/// The payload as persistence takes it.
fn write_of(input: &CreateKitInput) -> KitWrite<'_> {
    KitWrite {
        name: &input.name,
        slug: &input.slug,
        description: input.description.as_deref(),
        image_url: &input.image_url,
        kind: kind_slug(input.kind),
        pricing_mode: pricing_mode_slug(input.pricing_mode),
        base_cents: input.base_cents,
        percent_off: input.percent_off,
        min_items: input.min_items,
        max_items: input.max_items,
        max_kits_per_order: input.max_kits_per_order,
        unavailable_behavior: unavailable_behavior_slug(input.unavailable_behavior),
        coupon_stackable: input.coupon_stackable.unwrap_or(true),
        sort_order: input.sort_order,
        available: input.available,
        archived: input.archived.unwrap_or(false),
        groups: input
            .groups
            .iter()
            .map(|group| KitGroupWrite {
                client_id: &group.id,
                name: &group.name,
                min_items: group.min_items,
                max_items: group.max_items,
                sort_order: group.sort_order,
            })
            .collect(),
        items: input
            .items
            .iter()
            .map(|item| KitItemWrite {
                product_id: &item.product_id,
                variation_id: &item.variation_id,
                group_client_id: item.group_id.as_deref(),
                quantity: item.quantity,
                min_qty: item.min_qty,
                max_qty: item.max_qty,
                step: item.step,
                allow_swap: item.allow_swap,
                swap_variation_ids: &item.swap_variation_ids,
                sort_order: item.sort_order,
            })
            .collect(),
        bands: input
            .bands
            .iter()
            .map(|band| KitBandWrite {
                min_quantity: band.min_quantity,
                percent: band.percent,
            })
            .collect(),
    }
}

/// The stored kit with the patch applied: what the merged row will be once the
/// write lands, so the single create validator can judge it.
fn merge(stored: &KitDetail, patch: &UpdateKitInput) -> CreateKitInput {
    let kit = &stored.kit;

    let groups = patch.groups.clone().unwrap_or_else(|| {
        stored
            .groups
            .iter()
            .map(|group| KitGroupInput {
                id: group.id.clone(),
                name: group.name.clone(),
                min_items: group.min_items,
                max_items: group.max_items,
                sort_order: group.sort_order,
            })
            .collect()
    });

    let items = patch.items.clone().unwrap_or_else(|| {
        stored
            .items
            .iter()
            .map(|item| KitItemInput {
                id: Some(item.id.clone()),
                product_id: item.product_id.clone(),
                variation_id: item.variation_id.clone(),
                group_id: item.group_id.clone(),
                quantity: item.quantity,
                min_qty: item.min_qty,
                max_qty: item.max_qty,
                step: item.step,
                allow_swap: item.allow_swap,
                swap_variation_ids: stored.swaps.get(&item.id).cloned().unwrap_or_default(),
                sort_order: item.sort_order,
            })
            .collect()
    });

    let bands = patch.bands.clone().unwrap_or_else(|| {
        stored
            .bands
            .iter()
            .map(|band| contract::tenant::panel::kits::KitBandInput {
                min_quantity: band.min_quantity,
                percent: band.percent,
            })
            .collect()
    });

    CreateKitInput {
        name: patch.name.clone().unwrap_or_else(|| kit.name.clone()),
        slug: patch.slug.clone().unwrap_or_else(|| kit.slug.clone()),
        description: match &patch.description {
            Some(value) => value.clone(),
            None => kit.description.clone(),
        },
        image_url: patch
            .image_url
            .clone()
            .unwrap_or_else(|| kit.image_url.clone()),
        kind: patch.kind.unwrap_or_else(|| kind_of(&kit.kind)),
        pricing_mode: patch
            .pricing_mode
            .unwrap_or_else(|| pricing_mode_of(&kit.pricing_mode)),
        base_cents: patch.base_cents.unwrap_or(kit.base_cents),
        percent_off: pick(patch.percent_off, kit.percent_off),
        min_items: pick(patch.min_items, kit.min_items),
        max_items: pick(patch.max_items, kit.max_items),
        max_kits_per_order: pick(patch.max_kits_per_order, kit.max_kits_per_order),
        unavailable_behavior: patch
            .unavailable_behavior
            .unwrap_or_else(|| unavailable_behavior_of(&kit.unavailable_behavior)),
        coupon_stackable: patch.coupon_stackable.or(Some(kit.coupon_stackable)),
        sort_order: patch.sort_order.unwrap_or(kit.sort_order),
        available: patch.available.unwrap_or(kit.available),
        archived: patch.archived.or(Some(kit.archived)),
        groups,
        items,
        bands,
    }
}

/// `Some(null)` clears, `None` keeps the stored value.
fn pick(patch: Option<Option<i32>>, stored: Option<i32>) -> Option<i32> {
    match patch {
        Some(value) => value,
        None => stored,
    }
}

/// A duplicate slug is the merchant's conflict, not a server failure.
fn conflict_or(error: sqlx::Error) -> ApiError {
    if let sqlx::Error::Database(database) = &error
        && database.is_unique_violation()
    {
        return ApiError(contract::ErrorCode::Conflict);
    }

    db_error(error)
}

/// The catalog the editor picks dishes from: every product with its
/// variations, grouped here so the client does one request.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/kit-options",
    operation_id = "listPanelKitOptions",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelKitOptionsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn kit_options_route(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelKitOptionsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = kit_options(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let mut products: Vec<PanelKitOptionProduct> = Vec::new();

    for row in rows {
        let variation = PanelKitOptionVariation {
            id: row.variation_id,
            name: row.variation_name,
            price_cents: row.price_cents,
        };

        match products.last_mut() {
            Some(product) if product.id == row.product_id => {
                product.variations.push(variation);
            }
            _ => products.push(PanelKitOptionProduct {
                id: row.product_id,
                name: row.product_name,
                available: row.product_available,
                image_url: row.product_image_url,
                category_name: row.category_name,
                variations: vec![variation],
            }),
        }
    }

    Ok(Json(PanelKitOptionsOutput { products }))
}
