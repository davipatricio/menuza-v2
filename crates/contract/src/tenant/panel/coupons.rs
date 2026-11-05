//! coupons resource DTOs, ported from the Bun panel contract.
//!
//! `value` is one column with two meanings: cents for a fixed discount, whole
//! percent for a percentage one. The panel carries `valueCents` and
//! `valuePercent` as two nullable fields, so the UI never re-interprets it.
//!
//! A coupon an order or a redemption still names is history, not a draft:
//! deleting it archives the row and the answer says which of the two happened.

use crate::ErrorCode;

/// Longest coupon code, counted after trimming.
pub const CODE_MAX: usize = 64;

/// Longest coupon description.
pub const DESCRIPTION_MAX: usize = 280;

/// Longest id an input accepts.
pub const ID_MAX: usize = 64;

/// Most coupons one bulk delete accepts.
pub const BULK_MAX: usize = 200;

/// Most products or kits one coupon scope accepts.
pub const SCOPE_MAX: usize = 200;

/// `percentage` or `fixed`.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum DiscountType {
    Percentage,
    Fixed,
}

/// `active`, `expired` or `disabled`; `expired` is derived, never written by
/// the panel.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum CouponStatus {
    Active,
    Expired,
    Disabled,
}

/// The two states the write path accepts.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum CouponWriteStatus {
    Active,
    Disabled,
}

/// `include` applies only to the listed products, `exclude` to the rest.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum CouponProductScopeMode {
    Include,
    Exclude,
}

fn include_by_default() -> CouponProductScopeMode {
    CouponProductScopeMode::Include
}

/// The body of both create and update: the update replaces every field.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CouponInput {
    pub code: String,
    pub description: Option<String>,
    pub discount_type: DiscountType,
    pub discount_value: i32,
    pub usage_limit: Option<i32>,
    pub per_customer_limit: Option<i32>,
    pub minimum_order_cents: Option<i32>,
    pub maximum_discount_cents: Option<i32>,
    pub shipping_discount_percent: Option<i32>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub stackable: bool,
    pub first_purchase_only: bool,
    pub status: CouponWriteStatus,
    #[serde(default = "include_by_default")]
    pub product_scope_mode: CouponProductScopeMode,
    #[serde(default)]
    pub product_ids: Vec<String>,
    /// Kits the scope covers, same `include`/`exclude` reading as products.
    #[serde(default)]
    pub kit_ids: Vec<String>,
}

impl CouponInput {
    /// `code`: 1..=64 after trimming; `description`: at most 280;
    /// `discountValue`: 1 or more, at most 100 for a percentage; limits 1 or
    /// more; cents 0 or more; `shippingDiscountPercent`: 0..=100; scope ids
    /// 1..=64, at most 200 distinct.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        let code = self.code.trim();
        let percent_out_of_range =
            self.discount_type == DiscountType::Percentage && self.discount_value > 100;

        if code.is_empty()
            || code.chars().count() > CODE_MAX
            || self.discount_value < 1
            || percent_out_of_range
            || self
                .description
                .as_deref()
                .is_some_and(|description| description.chars().count() > DESCRIPTION_MAX)
            || self
                .shipping_discount_percent
                .is_some_and(|percent| !(0..=100).contains(&percent))
            || [self.usage_limit, self.per_customer_limit]
                .into_iter()
                .flatten()
                .any(|limit| limit < 1)
            || [self.minimum_order_cents, self.maximum_discount_cents]
                .into_iter()
                .flatten()
                .any(|cents| cents < 0)
            || self.product_ids.len() > SCOPE_MAX
            || self
                .product_ids
                .iter()
                .any(|id| id.is_empty() || id.chars().count() > ID_MAX)
            || self.kit_ids.len() > SCOPE_MAX
            || self
                .kit_ids
                .iter()
                .any(|id| id.is_empty() || id.chars().count() > ID_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ id, code, description, discountType, valueCents, valuePercent, … }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCoupon {
    pub id: String,
    pub code: String,
    pub description: Option<String>,
    pub discount_type: DiscountType,
    pub value_cents: Option<i32>,
    pub value_percent: Option<i32>,
    pub usage_count: i32,
    pub usage_limit: Option<i32>,
    pub per_customer_limit: Option<i32>,
    pub minimum_order_cents: Option<i32>,
    pub maximum_discount_cents: Option<i32>,
    pub shipping_discount_percent: Option<i32>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub stackable: bool,
    pub first_purchase_only: bool,
    pub status: CouponStatus,
    pub product_scope_mode: CouponProductScopeMode,
    pub product_ids: Vec<String>,
    pub kit_ids: Vec<String>,
}

/// `{ coupons }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponsOutput {
    pub coupons: Vec<PanelCoupon>,
}

/// One coupon row plus what the list needs, so the table never counts per row.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponSummary {
    pub id: String,
    pub code: String,
    pub description: Option<String>,
    pub discount_type: DiscountType,
    pub value_cents: Option<i32>,
    pub value_percent: Option<i32>,
    pub shipping_discount_percent: Option<i32>,
    pub status: CouponStatus,
    pub usage_count: i32,
    pub usage_limit: Option<i32>,
    pub per_customer_limit: Option<i32>,
    pub minimum_order_cents: Option<i32>,
    pub maximum_discount_cents: Option<i32>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub stackable: bool,
    pub first_purchase_only: bool,
    pub product_scope_mode: CouponProductScopeMode,
    pub product_ids: Vec<String>,
    pub kit_ids: Vec<String>,
    /// Derived from `endsAt`: a coupon past its window reads as expired.
    pub effective_status: CouponStatus,
    pub redemption_count: i64,
    pub discount_cents: i64,
    pub unique_customers: i64,
    pub last_redeemed_at: Option<String>,
}

/// `{ coupons }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponSummariesOutput {
    pub coupons: Vec<PanelCouponSummary>,
}

/// The customer an order's redemption belongs to.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponCustomer {
    pub id: String,
    pub name: String,
    pub email: String,
}

/// The order a redemption was written for.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponOrder {
    pub id: String,
    pub code: String,
    pub total_cents: i32,
    pub created_at: String,
}

/// One row of the coupon detail's redemption history.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponRedemption {
    pub id: String,
    pub discount_cents: i32,
    pub created_at: String,
    pub customer: PanelCouponCustomer,
    pub order: PanelCouponOrder,
}

/// One bucket of the usage series, keyed by the redemption day (UTC).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponUsagePoint {
    pub bucket: String,
    pub redemptions: i64,
    pub discount_cents: i64,
}

/// The detail filters the coupon screen writes to the URL.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponDetailQuery {
    /// Customer name/e-mail or order code, matched in SQL.
    pub search: Option<String>,
    /// `recent`, `oldest` or `discount`.
    pub sort: Option<String>,
    /// 1-based page of the redemption history.
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

impl PanelCouponDetailQuery {
    /// `search`: at most 120 characters; `sort`: one of the three names;
    /// `page`: 1..=2000; `pageSize`: 1..=50.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self
            .search
            .as_deref()
            .is_some_and(|search| search.chars().count() > 120)
            || self
                .sort
                .as_deref()
                .is_some_and(|sort| !matches!(sort, "" | "recent" | "oldest" | "discount"))
            || self.page.is_some_and(|page| !(1..=2000).contains(&page))
            || self
                .page_size
                .is_some_and(|page_size| !(1..=50).contains(&page_size))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// A product named by the coupon's scope, for the detail chips.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponProduct {
    pub id: String,
    pub name: String,
}

/// `{ coupon, products, redemptions, redemptionsTotal, usage,
/// ordersWithCouponCents }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponDetailOutput {
    pub coupon: PanelCouponSummary,
    pub products: Vec<PanelCouponProduct>,
    pub redemptions: Vec<PanelCouponRedemption>,
    /// Rows the search matches, so the client knows how many pages exist.
    pub redemptions_total: i64,
    pub usage: Vec<PanelCouponUsagePoint>,
    /// Sum of the orders that used this coupon, so the ticket average needs no
    /// second read.
    pub orders_with_coupon_cents: i64,
}

/// `{ coupon }`, returned by create and update alike.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponOutput {
    pub coupon: PanelCoupon,
}

/// `{ success, archived }`: the dialog tells the member which of the two
/// happened.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponDeleteOutput {
    pub success: bool,
    pub archived: bool,
}

/// `{ couponIds }`, at most 200 entries.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PanelCouponsBulkDeleteInput {
    pub coupon_ids: Vec<String>,
}

impl PanelCouponsBulkDeleteInput {
    /// At least one id, at most 200, each 1..=64 characters.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.coupon_ids.is_empty()
            || self.coupon_ids.len() > BULK_MAX
            || self
                .coupon_ids
                .iter()
                .any(|id| id.is_empty() || id.chars().count() > ID_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ deleted, archived }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponsBulkDeleteOutput {
    pub deleted: i64,
    pub archived: i64,
}

/// `{ status }`; the switch writes only `active` or `disabled`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PanelCouponStatusInput {
    pub status: CouponWriteStatus,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCouponSuccess {
    pub success: bool,
}
