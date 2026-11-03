//! search resource: panel routes.
//!
//! One read behind the dashboard palette: every entity kind, capped at five
//! rows each so a keystroke does not scan a table.
//!
//! The per-group limit is a window, not the answer: each query fetches twenty
//! rows, the ranking runs over that window and only then is it cut to five.
//! Five rows straight from `name ASC` would drop a prefix match that sorts late.
//! The groups are then cut to thirty rows in total, so a keystroke returns a
//! bounded page whatever the query matched.

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::tenant::panel::search::{
    PanelSearchGroup, PanelSearchItem, PanelSearchKind, PanelSearchOutput, PanelSearchQuery,
};
use domain::coupon::{CouponStatus, effective_coupon_status};
use persistence::tenant::panel::search::{SearchCoupon, search_windows};

use super::support::{context, guard, now};
use crate::domains::tenant::support::{ApiError, can, db_error};

/// Rows the palette shows per kind.
const GROUP_LIMIT: usize = 5;

/// Rows the palette shows in total, so one keystroke returns a bounded page.
const TOTAL_LIMIT: usize = 30;

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/panel/stores/{storeSlug}/search",
        axum::routing::get(search),
    )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(search),
        components(schemas(
            contract::tenant::panel::search::PanelSearchKind,
            contract::tenant::panel::search::PanelSearchItem,
            contract::tenant::panel::search::PanelSearchGroup,
            contract::tenant::panel::search::PanelSearchOutput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Every kind the palette searches, each group already ranked and capped.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/search",
    operation_id = "searchPanel",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("q" = Option<String>, Query, description = "The typed term, 2 to 80 characters.")
    ),
    responses(
        (status = 200, body = PanelSearchOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn search(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<PanelSearchQuery>,
) -> Result<Json<PanelSearchOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    query.validate().map_err(ApiError)?;

    let term = query.term();
    let pattern = like_pattern(term);
    let base = format!("/dashboard/{store_slug}");
    let plain_now = plain(now());

    let windows = search_windows(&state.pool, &ctx.tenant, &pattern)
        .await
        .map_err(db_error)?;

    let groups = [
        (
            PanelSearchKind::Product,
            windows
                .products
                .into_iter()
                .map(|product| PanelSearchItem {
                    kind: PanelSearchKind::Product,
                    id: product.id.clone(),
                    label: product.name,
                    sublabel: None,
                    status: Some(
                        if product.available {
                            "available"
                        } else {
                            "unavailable"
                        }
                        .to_owned(),
                    ),
                    href: format!("{base}/catalog/products/{}", product.id),
                })
                .collect(),
        ),
        (
            PanelSearchKind::Coupon,
            windows
                .coupons
                .into_iter()
                .map(|coupon| PanelSearchItem {
                    kind: PanelSearchKind::Coupon,
                    id: coupon.id.clone(),
                    label: coupon.code.clone(),
                    sublabel: coupon.description.clone(),
                    status: Some(coupon_status(&coupon, &plain_now)),
                    href: format!("{base}/coupons/{}", coupon.id),
                })
                .collect(),
        ),
        (
            PanelSearchKind::Customer,
            windows
                .customers
                .into_iter()
                .map(|customer| PanelSearchItem {
                    kind: PanelSearchKind::Customer,
                    id: customer.id.clone(),
                    label: customer.name,
                    sublabel: Some(customer.email),
                    status: None,
                    href: format!("{base}/customers/{}", customer.id),
                })
                .collect(),
        ),
        (
            PanelSearchKind::Tag,
            windows
                .tags
                .into_iter()
                .map(|tag| PanelSearchItem {
                    kind: PanelSearchKind::Tag,
                    id: tag.id,
                    label: tag.name,
                    sublabel: None,
                    status: Some(active_text(tag.is_active)),
                    href: format!("{base}/catalog/tags"),
                })
                .collect(),
        ),
        (
            PanelSearchKind::Category,
            windows
                .categories
                .into_iter()
                .map(|category| PanelSearchItem {
                    kind: PanelSearchKind::Category,
                    id: category.id,
                    label: category.name.clone(),
                    sublabel: None,
                    status: None,
                    href: format!(
                        "{base}/catalog/categories?q={}",
                        encode_component(&category.name)
                    ),
                })
                .collect(),
        ),
        (
            PanelSearchKind::Department,
            windows
                .departments
                .into_iter()
                .map(|department| PanelSearchItem {
                    kind: PanelSearchKind::Department,
                    id: department.id,
                    label: department.name.clone(),
                    sublabel: None,
                    status: Some(active_text(department.active)),
                    href: format!(
                        "{base}/catalog/departments?q={}",
                        encode_component(&department.name)
                    ),
                })
                .collect(),
        ),
        (
            PanelSearchKind::Badge,
            windows
                .badges
                .into_iter()
                .map(|badge| PanelSearchItem {
                    kind: PanelSearchKind::Badge,
                    id: badge.id,
                    label: badge.name,
                    sublabel: None,
                    status: Some(active_text(badge.is_active)),
                    href: format!("{base}/catalog/badges"),
                })
                .collect(),
        ),
        (
            PanelSearchKind::Subcategory,
            windows
                .subcategories
                .into_iter()
                .map(|subcategory| PanelSearchItem {
                    kind: PanelSearchKind::Subcategory,
                    id: subcategory.id,
                    label: subcategory.name.clone(),
                    sublabel: None,
                    status: None,
                    href: format!(
                        "{base}/catalog/subcategories?q={}",
                        encode_component(&subcategory.name)
                    ),
                })
                .collect(),
        ),
    ];

    // D5 asks for roughly thirty results in the palette, so the groups are cut
    // in their fixed order and a group left with no room is dropped rather than
    // emitted empty.
    let mut remaining = TOTAL_LIMIT;
    let mut capped = Vec::new();

    for (kind, items) in groups {
        if remaining == 0 {
            break;
        }

        let mut items = ranked(items, term);
        items.truncate(remaining);

        if items.is_empty() {
            continue;
        }

        remaining -= items.len();
        capped.push(PanelSearchGroup { kind, items });
    }

    Ok(Json(PanelSearchOutput {
        can_write: can(ctx.member.role, "catalog:write"),
        groups: capped,
    }))
}

/// The rows of one kind ranked over their window, then cut to the group size.
fn ranked(mut items: Vec<PanelSearchItem>, term: &str) -> Vec<PanelSearchItem> {
    items.sort_by(|left, right| {
        domain::search::compare((&left.label, &left.id), (&right.label, &right.id), term)
    });
    items.truncate(GROUP_LIMIT);

    items
}

/// The coupon's effective status, from its stored one and its window.
fn coupon_status(row: &SearchCoupon, now: &str) -> String {
    let stored = match row.status.as_str() {
        "disabled" => CouponStatus::Disabled,
        "expired" => CouponStatus::Expired,
        _ => CouponStatus::Active,
    };

    let ends_at = row.ends_at.map(plain);
    let status = effective_coupon_status(stored, ends_at.as_deref(), now).unwrap_or(stored);

    match status {
        CouponStatus::Active => "active",
        CouponStatus::Expired => "expired",
        CouponStatus::Disabled => "disabled",
    }
    .to_owned()
}

/// The status a flag renders as.
fn active_text(active: bool) -> String {
    if active { "active" } else { "disabled" }.to_owned()
}

/// `%`/`_` are wildcards in `ILIKE`; a literal search must escape them.
fn like_pattern(term: &str) -> String {
    let escaped = term
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");

    format!("%{escaped}%")
}

/// `encodeURIComponent`, for the taxonomy links that carry the name.
fn encode_component(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";

    let mut encoded = String::with_capacity(value.len());

    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            encoded.push(char::from(byte));
            continue;
        }

        encoded.push('%');
        encoded.push(char::from(HEX[usize::from(byte >> 4)]));
        encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }

    encoded
}

/// `Timestamp(3)` → `YYYY-MM-DDTHH:MM:SS.mmm`, the wall clock the window is
/// compared on.
fn plain(value: chrono::NaiveDateTime) -> String {
    value.format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}
