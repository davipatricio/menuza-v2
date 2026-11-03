//! coupons resource: panel routes.
//!
//! `value` is one column with two meanings, so every read splits it into
//! `valueCents` and `valuePercent` and the UI never re-interprets it.
//!
//! The validity window is widened to whole days and `expired` is derived from
//! it on every save; the switch writes only `active` or `disabled`, and cannot
//! turn a coupon whose window has closed back on. Deleting a coupon an order or
//! a redemption still names archives it instead of removing the ledger.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use chrono::NaiveDateTime;
use contract::ErrorCode;
use contract::tenant::panel::coupons::{
    CouponInput, CouponProductScopeMode, CouponStatus as ContractStatus,
    CouponWriteStatus as ContractWriteStatus, DiscountType as ContractDiscountType, PanelCoupon,
    PanelCouponCustomer, PanelCouponDeleteOutput, PanelCouponDetailOutput, PanelCouponDetailQuery,
    PanelCouponOrder, PanelCouponOutput, PanelCouponProduct, PanelCouponRedemption,
    PanelCouponStatusInput, PanelCouponSuccess, PanelCouponSummariesOutput, PanelCouponSummary,
    PanelCouponUsagePoint, PanelCouponsBulkDeleteInput, PanelCouponsBulkDeleteOutput,
    PanelCouponsOutput,
};
use domain::coupon::{
    CouponStatus as DomainStatus, CouponWriteStatus as DomainWriteStatus,
    DiscountType as DomainDiscountType, RedemptionAggregate, RedemptionRow,
    effective_coupon_status, resolve_coupon_status, usage_series,
};
use persistence::tenant::panel::coupons::{
    CouponRow, CouponWrite, coupon_bulk_delete, coupon_code_taken, coupon_create, coupon_delete,
    coupon_find, coupon_links, coupon_list, coupon_orders_total, coupon_products,
    coupon_redemption_pairs, coupon_redemptions, coupon_redemptions_total, coupon_set_status,
    coupon_update, coupon_usage,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// The page size the detail history uses when the caller omits one.
const DEFAULT_PAGE_SIZE: i64 = 20;

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/coupons",
            axum::routing::get(list_coupons).post(create_coupon),
        )
        .route(
            "/panel/stores/{storeSlug}/coupons/summaries",
            axum::routing::get(list_coupon_summaries),
        )
        .route(
            "/panel/stores/{storeSlug}/coupons/bulk-delete",
            axum::routing::post(bulk_delete_coupons),
        )
        .route(
            "/panel/stores/{storeSlug}/coupons/{couponId}",
            axum::routing::get(get_coupon_detail)
                .put(update_coupon)
                .delete(delete_coupon),
        )
        .route(
            "/panel/stores/{storeSlug}/coupons/{couponId}/status",
            axum::routing::post(set_coupon_status),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            list_coupons,
            create_coupon,
            bulk_delete_coupons,
            list_coupon_summaries,
            get_coupon_detail,
            update_coupon,
            delete_coupon,
            set_coupon_status
        ),
        components(schemas(
            contract::tenant::panel::coupons::CouponInput,
            contract::tenant::panel::coupons::CouponProductScopeMode,
            contract::tenant::panel::coupons::CouponStatus,
            contract::tenant::panel::coupons::CouponWriteStatus,
            contract::tenant::panel::coupons::DiscountType,
            contract::tenant::panel::coupons::PanelCoupon,
            contract::tenant::panel::coupons::PanelCouponCustomer,
            contract::tenant::panel::coupons::PanelCouponDeleteOutput,
            contract::tenant::panel::coupons::PanelCouponDetailOutput,
            contract::tenant::panel::coupons::PanelCouponOrder,
            contract::tenant::panel::coupons::PanelCouponOutput,
            contract::tenant::panel::coupons::PanelCouponProduct,
            contract::tenant::panel::coupons::PanelCouponRedemption,
            contract::tenant::panel::coupons::PanelCouponStatusInput,
            contract::tenant::panel::coupons::PanelCouponSuccess,
            contract::tenant::panel::coupons::PanelCouponSummariesOutput,
            contract::tenant::panel::coupons::PanelCouponSummary,
            contract::tenant::panel::coupons::PanelCouponUsagePoint,
            contract::tenant::panel::coupons::PanelCouponsBulkDeleteInput,
            contract::tenant::panel::coupons::PanelCouponsBulkDeleteOutput,
            contract::tenant::panel::coupons::PanelCouponsOutput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The store's coupons, before the usage aggregates.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/coupons",
    operation_id = "listPanelCoupons",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelCouponsOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_coupons(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelCouponsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = coupon_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let links = coupon_links(
        &state.pool,
        &ctx.tenant,
        &rows.iter().map(|row| row.id.clone()).collect::<Vec<_>>(),
    )
    .await
    .map_err(db_error)?;

    let mut product_ids = group_links(links);

    let coupons = rows
        .into_iter()
        .map(|row| panel_coupon(&row, product_ids.remove(&row.id).unwrap_or_default()))
        .collect();

    Ok(Json(PanelCouponsOutput { coupons }))
}

/// Creates a coupon and its product scope.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/coupons",
    operation_id = "createPanelCoupon",
    tag = "panel",
    request_body = CouponInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelCouponOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn create_coupon(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<CouponInput>,
) -> Result<Json<PanelCouponOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let product_ids = distinct(&input.product_ids);
    let coupon_id = uuid::Uuid::new_v4().to_string();
    let code = input.code.trim().to_uppercase();
    let write = prepare_write(&input, &code, &product_ids)?;

    if coupon_code_taken(&state.pool, &ctx.tenant, write.code)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let created = coupon_create(&state.pool, &ctx.tenant, &coupon_id, &write)
        .await
        .map_err(db_error)?;

    if !created {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelCouponOutput {
        coupon: stored_coupon(&state, &ctx.tenant, &coupon_id).await?,
    }))
}

/// Replaces every field of the coupon and its whole product scope.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/coupons/{couponId}",
    operation_id = "updatePanelCoupon",
    tag = "panel",
    request_body = CouponInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("couponId" = String, Path, description = "The coupon to replace.")
    ),
    responses(
        (status = 200, body = PanelCouponOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn update_coupon(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, coupon_id)): Path<(String, String)>,
    Json(input): Json<CouponInput>,
) -> Result<Json<PanelCouponOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let Some(existing) = coupon_find(&state.pool, &ctx.tenant, &coupon_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let product_ids = distinct(&input.product_ids);
    let code = input.code.trim().to_uppercase();
    let write = prepare_write(&input, &code, &product_ids)?;

    if write.code != existing.code
        && coupon_code_taken(&state.pool, &ctx.tenant, write.code)
            .await
            .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Conflict));
    }

    let updated = coupon_update(&state.pool, &ctx.tenant, &coupon_id, &write)
        .await
        .map_err(db_error)?;

    if !updated {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelCouponOutput {
        coupon: stored_coupon(&state, &ctx.tenant, &coupon_id).await?,
    }))
}

/// Deletes a coupon, or archives it when the ledger still names it.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/coupons/{couponId}",
    operation_id = "deletePanelCoupon",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("couponId" = String, Path, description = "The coupon to delete.")
    ),
    responses(
        (status = 200, body = PanelCouponDeleteOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_coupon(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, coupon_id)): Path<(String, String)>,
) -> Result<Json<PanelCouponDeleteOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    let outcome = coupon_delete(&state.pool, &ctx.tenant, &coupon_id, now())
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(PanelCouponDeleteOutput {
        success: true,
        archived: outcome == domain::coupon::CouponDeleteOutcome::Archived,
    }))
}

/// Deletes or archives the whole selection in one transaction.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/coupons/bulk-delete",
    operation_id = "bulkDeletePanelCoupons",
    tag = "panel",
    request_body = PanelCouponsBulkDeleteInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelCouponsBulkDeleteOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn bulk_delete_coupons(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<PanelCouponsBulkDeleteInput>,
) -> Result<Json<PanelCouponsBulkDeleteOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    let (deleted, archived) = coupon_bulk_delete(
        &state.pool,
        &ctx.tenant,
        &distinct(&input.coupon_ids),
        now(),
    )
    .await
    .map_err(db_error)?
    .ok_or_else(ApiError::not_found)?;

    Ok(Json(PanelCouponsBulkDeleteOutput { deleted, archived }))
}

/// The store's coupons with their redemption totals.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/coupons/summaries",
    operation_id = "listPanelCouponSummaries",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelCouponSummariesOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_coupon_summaries(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelCouponSummariesOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = coupon_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();

    let links = coupon_links(&state.pool, &ctx.tenant, &ids)
        .await
        .map_err(db_error)?;

    let aggregates = redemption_aggregates(&state, &ctx.tenant, &ids).await?;

    let mut product_ids = group_links(links);
    let now = plain(now());

    let coupons = rows
        .into_iter()
        .map(|row| {
            panel_coupon_summary(
                &row,
                aggregates.get(&row.id),
                product_ids.remove(&row.id).unwrap_or_default(),
                &now,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(PanelCouponSummariesOutput { coupons }))
}

/// One coupon with a page of its redemption history and its usage series.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/coupons/{couponId}",
    operation_id = "getPanelCouponDetail",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("couponId" = String, Path, description = "The coupon to read."),
        ("search" = Option<String>, Query, description = "Customer name/e-mail or order code, matched in SQL."),
        ("sort" = Option<String>, Query, description = "`recent`, `oldest` or `discount`."),
        ("page" = Option<i64>, Query, description = "1-based page of the redemption history."),
        ("pageSize" = Option<i64>, Query, description = "Rows per page, 1 to 50.")
    ),
    responses(
        (status = 200, body = PanelCouponDetailOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_coupon_detail(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, coupon_id)): Path<(String, String)>,
    Query(query): Query<PanelCouponDetailQuery>,
) -> Result<Json<PanelCouponDetailOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    query.validate().map_err(ApiError)?;

    let Some(coupon) = coupon_find(&state.pool, &ctx.tenant, &coupon_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    let products = coupon_products(&state.pool, &ctx.tenant, &coupon_id)
        .await
        .map_err(db_error)?;

    let search = query.search.as_deref().unwrap_or("").trim();
    let pattern = like_pattern(search);
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(DEFAULT_PAGE_SIZE);
    let sort = query.sort.as_deref().unwrap_or("recent");

    let redemptions = coupon_redemptions(
        &state.pool,
        &ctx.tenant,
        &coupon_id,
        &pattern,
        sort,
        page_size,
        (page - 1) * page_size,
    )
    .await
    .map_err(db_error)?;

    let redemptions_total =
        coupon_redemptions_total(&state.pool, &ctx.tenant, &coupon_id, &pattern)
            .await
            .map_err(db_error)?;

    let usage = usage_series(
        &coupon_usage(&state.pool, &ctx.tenant, &coupon_id)
            .await
            .map_err(db_error)?,
    );

    let orders_with_coupon_cents = coupon_orders_total(&state.pool, &ctx.tenant, &coupon_id)
        .await
        .map_err(db_error)?;

    let links = coupon_links(&state.pool, &ctx.tenant, std::slice::from_ref(&coupon_id))
        .await
        .map_err(db_error)?;

    let aggregates =
        redemption_aggregates(&state, &ctx.tenant, std::slice::from_ref(&coupon_id)).await?;

    let product_ids = links
        .into_iter()
        .map(|link| link.product_id)
        .collect::<Vec<_>>();

    let coupon = panel_coupon_summary(
        &coupon,
        aggregates.get(&coupon.id),
        product_ids,
        &plain(now()),
    )?;

    Ok(Json(PanelCouponDetailOutput {
        coupon,
        products: products
            .into_iter()
            .map(|product| PanelCouponProduct {
                id: product.id,
                name: product.name,
            })
            .collect(),
        redemptions: redemptions
            .into_iter()
            .map(|row| PanelCouponRedemption {
                id: row.id,
                discount_cents: row.discount_cents,
                created_at: iso(row.created_at),
                customer: PanelCouponCustomer {
                    id: row.customer_id,
                    name: row.customer_name,
                    email: row.customer_email,
                },
                order: PanelCouponOrder {
                    id: row.order_id,
                    code: row.order_code,
                    total_cents: row.order_total_cents,
                    created_at: iso(row.order_created_at),
                },
            })
            .collect(),
        redemptions_total,
        usage: usage
            .iter()
            .map(|point| PanelCouponUsagePoint {
                bucket: point.bucket.clone(),
                redemptions: point.redemptions,
                discount_cents: point.discount_cents,
            })
            .collect(),
        orders_with_coupon_cents,
    }))
}

/// The switch writes the stored status; a coupon past its window is refused.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/coupons/{couponId}/status",
    operation_id = "setPanelCouponStatus",
    tag = "panel",
    request_body = PanelCouponStatusInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("couponId" = String, Path, description = "The coupon to switch.")
    ),
    responses(
        (status = 200, body = PanelCouponSuccess),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn set_coupon_status(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, coupon_id)): Path<(String, String)>,
    Json(input): Json<PanelCouponStatusInput>,
) -> Result<Json<PanelCouponSuccess>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    let Some(coupon) = coupon_find(&state.pool, &ctx.tenant, &coupon_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    // `String` keeps the column UTC-naive; the window rules read a wall clock.
    let ends_at = coupon.ends_at.map(plain);
    let status = resolve_coupon_status(
        write_status(input.status),
        ends_at.as_deref(),
        &plain(now()),
    )
    .map_err(|_| ApiError(ErrorCode::ValidationFailed))?;

    if input.status == ContractWriteStatus::Active && status == DomainStatus::Expired {
        return Err(ApiError(ErrorCode::ValidationFailed));
    }

    let updated = coupon_set_status(&state.pool, &ctx.tenant, &coupon_id, status_text(status))
        .await
        .map_err(db_error)?;

    if !updated {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelCouponSuccess { success: true }))
}

/// The row as the plain coupon schema carries it.
/// MCP reuses this: the tool maps the same coupon rows.
pub(crate) fn panel_coupon(row: &CouponRow, product_ids: Vec<String>) -> PanelCoupon {
    let (value_cents, value_percent) = coupon_values(row);

    PanelCoupon {
        id: row.id.clone(),
        code: row.code.clone(),
        description: row.description.clone(),
        discount_type: contract_discount(&row.discount_type),
        value_cents,
        value_percent,
        usage_count: row.usage_count,
        usage_limit: row.usage_limit,
        per_customer_limit: row.per_customer_limit,
        minimum_order_cents: row.minimum_order_cents,
        maximum_discount_cents: row.maximum_discount_cents,
        shipping_discount_percent: row.shipping_discount_percent,
        starts_at: row.starts_at.map(plain),
        ends_at: row.ends_at.map(plain),
        stackable: row.stackable,
        first_purchase_only: row.first_purchase_only,
        status: contract_status(stored_status(&row.status)),
        product_scope_mode: contract_scope_mode(&row.product_scope_mode),
        product_ids,
    }
}

/// The row plus its derived usage totals.
fn panel_coupon_summary(
    row: &CouponRow,
    aggregate: Option<&RedemptionAggregate>,
    product_ids: Vec<String>,
    now: &str,
) -> Result<PanelCouponSummary, ApiError> {
    let (value_cents, value_percent) = coupon_values(row);
    let effective = effective_coupon_status(
        stored_status(&row.status),
        row.ends_at.map(plain).as_deref(),
        now,
    )
    .map_err(|_| ApiError(ErrorCode::ValidationFailed))?;

    Ok(PanelCouponSummary {
        id: row.id.clone(),
        code: row.code.clone(),
        description: row.description.clone(),
        discount_type: contract_discount(&row.discount_type),
        value_cents,
        value_percent,
        shipping_discount_percent: row.shipping_discount_percent,
        status: contract_status(stored_status(&row.status)),
        usage_count: row.usage_count,
        usage_limit: row.usage_limit,
        per_customer_limit: row.per_customer_limit,
        minimum_order_cents: row.minimum_order_cents,
        maximum_discount_cents: row.maximum_discount_cents,
        starts_at: row.starts_at.map(iso),
        ends_at: row.ends_at.map(iso),
        stackable: row.stackable,
        first_purchase_only: row.first_purchase_only,
        product_scope_mode: contract_scope_mode(&row.product_scope_mode),
        product_ids,
        effective_status: contract_status(effective),
        redemption_count: aggregate.map_or(0, |totals| totals.redemptions),
        discount_cents: aggregate.map_or(0, |totals| totals.discount_cents),
        unique_customers: aggregate.map_or(0, |totals| totals.customers),
        last_redeemed_at: aggregate.and_then(|totals| totals.last_redeemed_at.clone()),
    })
}

/// Splits `value` by discount type.
fn coupon_values(row: &CouponRow) -> (Option<i32>, Option<i32>) {
    let value = i64::from(row.value);
    let (cents, percent) = domain::coupon::coupon_values(
        if row.discount_type == "fixed" {
            DomainDiscountType::Fixed
        } else {
            DomainDiscountType::Percentage
        },
        value,
    );

    (
        cents.map(|value| value as i32),
        percent.map(|value| value as i32),
    )
}

/// Folds the grouped redemption rows into per-coupon totals.
async fn redemption_aggregates(
    state: &crate::State,
    tenant: &persistence::tenant::TenantId,
    coupon_ids: &[String],
) -> Result<HashMap<String, RedemptionAggregate>, ApiError> {
    let rows = coupon_redemption_pairs(&state.pool, tenant, coupon_ids)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(|pair| RedemptionRow {
            coupon_id: pair.coupon_id,
            redemptions: pair.redemptions,
            discount_cents: pair.discount_cents,
            last_redeemed_at: Some(iso(pair.last_redeemed_at)),
            first_redeemed_at: Some(iso(pair.first_redeemed_at)),
        })
        .collect::<Vec<_>>();

    Ok(domain::coupon::aggregate_redemptions(&rows)
        .into_iter()
        .map(|aggregate| (aggregate.coupon_id.clone(), aggregate))
        .collect())
}

/// The stored coupon after a write, so the answer is the row and not the input.
async fn stored_coupon(
    state: &crate::State,
    tenant: &persistence::tenant::TenantId,
    coupon_id: &str,
) -> Result<PanelCoupon, ApiError> {
    let Some(row) = coupon_find(&state.pool, tenant, coupon_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError(ErrorCode::Internal));
    };

    let links = coupon_links(&state.pool, tenant, &[coupon_id.to_owned()])
        .await
        .map_err(db_error)?;

    let product_ids = links
        .into_iter()
        .map(|link| link.product_id)
        .collect::<Vec<_>>();

    Ok(panel_coupon(&row, product_ids))
}

/// Widens the window and derives the status a write stores.
/// MCP reuses this: the tool validates the same window before the insert.
pub(crate) fn prepare_write<'a>(
    input: &'a CouponInput,
    code: &'a str,
    product_ids: &'a [String],
) -> Result<CouponWrite<'a>, ApiError> {
    let window =
        domain::coupon::coupon_window(input.starts_at.as_deref(), input.ends_at.as_deref())
            .map_err(|_| ApiError(ErrorCode::ValidationFailed))?;

    let status = resolve_coupon_status(
        write_status(input.status),
        window.ends_at.as_deref(),
        &plain(now()),
    )
    .map_err(|_| ApiError(ErrorCode::ValidationFailed))?;

    Ok(CouponWrite {
        code,
        description: input.description.as_deref(),
        discount_type: match input.discount_type {
            ContractDiscountType::Percentage => "percentage",
            ContractDiscountType::Fixed => "fixed",
        },
        value: input.discount_value,
        status: status_text(status),
        product_scope_mode: match input.product_scope_mode {
            CouponProductScopeMode::Include => "include",
            CouponProductScopeMode::Exclude => "exclude",
        },
        starts_at: window.starts_at.as_deref().and_then(parse_plain),
        ends_at: window.ends_at.as_deref().and_then(parse_plain),
        usage_limit: input.usage_limit,
        per_customer_limit: input.per_customer_limit,
        minimum_order_cents: input.minimum_order_cents,
        maximum_discount_cents: input.maximum_discount_cents,
        shipping_discount_percent: input.shipping_discount_percent,
        stackable: input.stackable,
        first_purchase_only: input.first_purchase_only,
        product_ids,
    })
}

/// `YYYY-MM-DDTHH:MM:SS.mmm` to the UTC-naive column value.
fn parse_plain(value: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.3f").ok()
}

/// Drop duplicates, so the picker may send the same id twice.
/// MCP reuses this: the tool normalizes the same product scope.
pub(crate) fn distinct(ids: &[String]) -> Vec<String> {
    let mut distinct: Vec<String> = Vec::with_capacity(ids.len());

    for id in ids {
        if !distinct.contains(id) {
            distinct.push(id.clone());
        }
    }

    distinct
}

/// The coupon links grouped by coupon id.
/// MCP reuses this: the tool groups the same product links.
pub(crate) fn group_links(
    links: Vec<persistence::tenant::panel::coupons::CouponLink>,
) -> HashMap<String, Vec<String>> {
    let mut grouped: HashMap<String, Vec<String>> = HashMap::new();

    for link in links {
        grouped
            .entry(link.coupon_id)
            .or_default()
            .push(link.product_id);
    }

    grouped
}

/// `%`/`_` are wildcards in `ILIKE`; a literal search must escape them.
fn like_pattern(term: &str) -> String {
    if term.is_empty() {
        return String::new();
    }

    let escaped = term
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");

    format!("%{escaped}%")
}

/// `Timestamp(3)` → `YYYY-MM-DDTHH:MM:SS.mmm`, the wall clock the form edits.
fn plain(value: NaiveDateTime) -> String {
    value.format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

fn stored_status(raw: &str) -> DomainStatus {
    match raw {
        "disabled" => DomainStatus::Disabled,
        "expired" => DomainStatus::Expired,
        _ => DomainStatus::Active,
    }
}

fn status_text(status: DomainStatus) -> &'static str {
    match status {
        DomainStatus::Active => "active",
        DomainStatus::Expired => "expired",
        DomainStatus::Disabled => "disabled",
    }
}

fn contract_status(status: DomainStatus) -> ContractStatus {
    match status {
        DomainStatus::Active => ContractStatus::Active,
        DomainStatus::Expired => ContractStatus::Expired,
        DomainStatus::Disabled => ContractStatus::Disabled,
    }
}

fn write_status(status: ContractWriteStatus) -> DomainWriteStatus {
    match status {
        ContractWriteStatus::Active => DomainWriteStatus::Active,
        ContractWriteStatus::Disabled => DomainWriteStatus::Disabled,
    }
}

fn contract_discount(raw: &str) -> ContractDiscountType {
    if raw == "fixed" {
        ContractDiscountType::Fixed
    } else {
        ContractDiscountType::Percentage
    }
}

fn contract_scope_mode(raw: &str) -> CouponProductScopeMode {
    if raw == "exclude" {
        CouponProductScopeMode::Exclude
    } else {
        CouponProductScopeMode::Include
    }
}
