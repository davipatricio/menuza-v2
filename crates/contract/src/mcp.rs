//! MCP refusal bodies and tool parameter schemas, ported from
//! `apps/tenant/src/mcp/server.ts` and `apps/tenant/src/mcp/tools.ts`.
//!
//! `/mcp` is a protocol surface, not a REST resource: none of these types
//! derives `utoipa::ToSchema` and no route that carries them reaches the
//! OpenAPI document. The envelope is the OAuth2 one MCP clients already parse
//! (`error` plus `error_description`), because before a tool runs the endpoint
//! is still speaking the authorization protocol.
//!
//! The tool inputs are mirrored from the panel's Valibot schemas, field for
//! field and constraint for constraint, so a client generated from the MCP
//! schema sends exactly what the procedure accepted. `storeSlug` is optional
//! here because the endpoint drops it from the schema when the grant covers one
//! store; the tool fills it in from the grant.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::commerce::orders::OrderAxis;
use crate::tenant::panel::coupons::{
    CouponInput, CouponProductScopeMode, CouponWriteStatus, DiscountType,
};
use crate::tenant::panel::products::{
    CreateProductInput, ProductVariationInput, UpdateProductInput,
};

/// `{ error, error_description }` — the body of a refused `/mcp` request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpErrorOutput {
    pub error: String,
    pub error_description: String,
}

impl McpErrorOutput {
    /// One error and its description.
    pub fn new(error: &str, error_description: impl Into<String>) -> Self {
        Self {
            error: error.to_owned(),
            error_description: error_description.into(),
        }
    }
}

/// `orders_list` input, mirrored from `PanelOrdersInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpOrdersListInput {
    pub store_slug: Option<String>,
    pub financial_status: Option<String>,
    pub fulfilment_status: Option<String>,
    pub payment_method: Option<String>,
}

/// `order_get` and `order_list_transitions` input, mirrored from
/// `PanelOrderIdInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpOrderIdInput {
    pub store_slug: Option<String>,
    pub order_code: String,
}

/// `products_list` input, mirrored from `ListProductsInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpProductsListInput {
    pub store_slug: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
}

/// `product_get` input, mirrored from `ProductIdInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpProductIdInput {
    pub store_slug: Option<String>,
    pub product_id: String,
}

/// Inputs that carry nothing but the store, mirrored from
/// `PanelStoreInputSchema`: `customers_list`, `coupons_list`, `audit_list`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpStoreInput {
    pub store_slug: Option<String>,
}

/// `customer_get` input, mirrored from `PanelCustomerIdInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpCustomerIdInput {
    pub store_slug: Option<String>,
    pub customer_id: String,
}

/// `categories_list` input, mirrored from `ListCategoriesInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpCategoriesListInput {
    pub store_slug: Option<String>,
    pub q: Option<String>,
    pub status: Option<String>,
    pub department_id: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
}

/// `departments_list` input, mirrored from `ListDepartmentsInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpDepartmentsListInput {
    pub store_slug: Option<String>,
    pub q: Option<String>,
    pub status: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
}

/// `tags_list` input, mirrored from `ListTagsInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpTagsListInput {
    pub store_slug: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
}

/// `seo_list_entities` input, mirrored from `PanelSeoEntitiesInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpSeoEntitiesInput {
    pub store_slug: Option<String>,
    pub entity_type: Option<String>,
}

/// One JSON-Schema object in the shape Valibot emitted: closed properties, the
/// required list and the draft-07 marker.
fn schema(properties: Vec<(&str, Value)>, required: &[&str]) -> Value {
    schema_with(properties, required, true)
}

/// The same, with `additionalProperties` only where the Valibot schema was
/// strict — `v.object` accepted extra keys.
fn schema_with(properties: Vec<(&str, Value)>, required: &[&str], closed: bool) -> Value {
    let properties: Map<String, Value> = properties
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect();

    let mut value = json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "$schema": "http://json-schema.org/draft-07/schema#",
    });

    if closed {
        value["additionalProperties"] = json!(false);
    }

    value
}

/// The `storeSlug` property every tool input shares.
fn store_slug() -> Value {
    json!({"type": "string", "minLength": 1, "maxLength": 120})
}

/// The `orderCode` property of the two order reads.
fn order_code() -> Value {
    json!({"type": "string", "minLength": 1, "maxLength": 64})
}

/// A closed string enum.
fn enum_string(values: &[&str]) -> Value {
    json!({"enum": values, "type": "string"})
}

fn string_property(max_length: Option<u32>, default: &str) -> Value {
    let mut property = json!({"type": "string"});
    if let Some(max_length) = max_length {
        property["maxLength"] = json!(max_length);
    }
    property["default"] = json!(default);
    property
}

fn asc_desc() -> Value {
    enum_string(&["asc", "desc"])
}

/// The `orders_list` schema.
pub fn orders_list_schema() -> Value {
    schema(
        vec![
            ("storeSlug", store_slug()),
            (
                "financialStatus",
                enum_string(&[
                    "pending",
                    "awaiting_payment",
                    "pending_on_delivery",
                    "paid",
                    "refunded",
                    "expired",
                    "canceled",
                ]),
            ),
            (
                "fulfilmentStatus",
                enum_string(&[
                    "pending",
                    "confirmed",
                    "preparing",
                    "ready",
                    "ready_for_pickup",
                    "out_for_delivery",
                    "completed",
                    "canceled",
                ]),
            ),
            (
                "paymentMethod",
                enum_string(&[
                    "pix",
                    "credit",
                    "debit",
                    "meal_voucher",
                    "food_voucher",
                    "boleto",
                    "cash_on_delivery",
                    "card_on_delivery",
                ]),
            ),
        ],
        &["storeSlug"],
    )
}

/// The `order_get` and `order_list_transitions` schema.
pub fn order_id_schema() -> Value {
    schema(
        vec![("storeSlug", store_slug()), ("orderCode", order_code())],
        &["storeSlug", "orderCode"],
    )
}

/// The `products_list` schema.
pub fn products_list_schema() -> Value {
    let mut sort_by = enum_string(&[
        "sortOrder",
        "name",
        "updatedAt",
        "price",
        "category",
        "stock",
    ]);
    sort_by["default"] = json!("sortOrder");

    let mut order = asc_desc();
    order["default"] = json!("asc");

    schema(
        vec![
            ("storeSlug", store_slug()),
            ("sortBy", sort_by),
            ("order", order),
        ],
        &["storeSlug"],
    )
}

/// The `product_get` schema.
pub fn product_id_schema() -> Value {
    schema(
        vec![
            ("storeSlug", store_slug()),
            (
                "productId",
                json!({"type": "string", "minLength": 1, "maxLength": 64}),
            ),
        ],
        &["storeSlug", "productId"],
    )
}

/// The `customers_list`, `coupons_list` and `audit_list` schema.
pub fn store_schema() -> Value {
    schema(vec![("storeSlug", store_slug())], &["storeSlug"])
}

/// The `customer_get` schema.
pub fn customer_id_schema() -> Value {
    schema(
        vec![
            ("storeSlug", store_slug()),
            (
                "customerId",
                json!({"type": "string", "minLength": 1, "maxLength": 64}),
            ),
        ],
        &["storeSlug", "customerId"],
    )
}

/// The `categories_list` schema.
pub fn categories_list_schema() -> Value {
    let mut sort_by = enum_string(&["name", "itemsCount", "updatedAt", "sortOrder"]);
    sort_by["default"] = json!("sortOrder");

    let mut order = asc_desc();
    order["default"] = json!("asc");

    schema(
        vec![
            ("storeSlug", store_slug()),
            ("q", string_property(Some(120), "")),
            ("status", {
                let mut status = enum_string(&["all", "active", "inactive"]);
                status["default"] = json!("all");
                status
            }),
            ("departmentId", string_property(Some(64), "")),
            ("sortBy", sort_by),
            ("order", order),
        ],
        &["storeSlug"],
    )
}

/// The `departments_list` schema.
pub fn departments_list_schema() -> Value {
    let mut sort_by = enum_string(&["name", "itemsCount", "updatedAt"]);
    sort_by["default"] = json!("name");

    let mut order = asc_desc();
    order["default"] = json!("asc");

    schema(
        vec![
            ("storeSlug", store_slug()),
            ("q", string_property(Some(120), "")),
            ("status", {
                let mut status = enum_string(&["all", "active", "inactive"]);
                status["default"] = json!("all");
                status
            }),
            ("sortBy", sort_by),
            ("order", order),
        ],
        &["storeSlug"],
    )
}

/// The `tags_list` schema.
pub fn tags_list_schema() -> Value {
    let mut sort_by = enum_string(&["name", "itemsCount"]);
    sort_by["default"] = json!("name");

    let mut order = asc_desc();
    order["default"] = json!("asc");

    schema(
        vec![
            ("storeSlug", store_slug()),
            ("sortBy", sort_by),
            ("order", order),
        ],
        &["storeSlug"],
    )
}

/// The `seo_list_entities` schema.
pub fn seo_entities_schema() -> Value {
    schema(
        vec![
            ("storeSlug", store_slug()),
            (
                "entityType",
                enum_string(&[
                    "store",
                    "department",
                    "category",
                    "tag",
                    "product",
                    "kit",
                    "coupon",
                ]),
            ),
        ],
        &["storeSlug"],
    )
}

/// `order_transition` input, mirrored from `PanelOrderTransitionInputSchema`.
/// The schema is open, as the Valibot `v.object` was: extra keys are ignored.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpOrderTransitionInput {
    pub store_slug: Option<String>,
    pub order_code: String,
    pub axis: OrderAxis,
    pub to: String,
    pub reason: Option<String>,
}

impl McpOrderTransitionInput {
    /// The panel body this call maps onto, so the handler's own validation runs.
    pub fn into_input(self) -> crate::tenant::panel::orders::PanelOrderTransitionInput {
        crate::tenant::panel::orders::PanelOrderTransitionInput {
            axis: self.axis,
            to: self.to,
            reason: self.reason,
        }
    }
}

/// `product_create` input, mirrored from `CreateProductInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpCreateProductInput {
    pub store_slug: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub subcategory_id: Option<String>,
    pub tag_ids: Vec<String>,
    pub badge_ids: Option<Vec<String>>,
    pub available: bool,
    pub archived: Option<bool>,
    pub hidden: Option<bool>,
    pub private: Option<bool>,
    pub sort_order: i32,
    pub variations: Vec<ProductVariationInput>,
}

impl McpCreateProductInput {
    /// The panel body this call maps onto, so the handler's own validation runs.
    pub fn into_input(self) -> CreateProductInput {
        CreateProductInput {
            name: self.name,
            description: self.description,
            subcategory_id: self.subcategory_id,
            tag_ids: self.tag_ids,
            badge_ids: self.badge_ids,
            available: self.available,
            archived: self.archived,
            hidden: self.hidden,
            private: self.private,
            sort_order: self.sort_order,
            variations: self.variations,
        }
    }
}

/// `product_update` input, mirrored from `UpdateProductInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpUpdateProductInput {
    pub store_slug: Option<String>,
    pub product_id: String,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub subcategory_id: Option<Option<String>>,
    pub tag_ids: Option<Vec<String>>,
    pub badge_ids: Option<Vec<String>>,
    pub available: Option<bool>,
    pub archived: Option<bool>,
    pub hidden: Option<bool>,
    pub private: Option<bool>,
    pub sort_order: Option<i32>,
    pub variations: Option<Vec<ProductVariationInput>>,
}

impl McpUpdateProductInput {
    /// The panel body this call maps onto, so the handler's own validation runs.
    pub fn into_input(self) -> UpdateProductInput {
        UpdateProductInput {
            name: self.name,
            description: self.description,
            subcategory_id: self.subcategory_id,
            tag_ids: self.tag_ids,
            badge_ids: self.badge_ids,
            available: self.available,
            archived: self.archived,
            hidden: self.hidden,
            private: self.private,
            sort_order: self.sort_order,
            variations: self.variations,
        }
    }
}

/// `coupon_create` input, mirrored from `CreateCouponInputSchema`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct McpCreateCouponInput {
    pub store_slug: Option<String>,
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
    pub product_scope_mode: Option<CouponProductScopeMode>,
    #[serde(default)]
    pub product_ids: Vec<String>,
}

impl McpCreateCouponInput {
    /// The panel body this call maps onto, so the handler's own validation runs.
    pub fn into_input(self) -> CouponInput {
        CouponInput {
            code: self.code,
            description: self.description,
            discount_type: self.discount_type,
            discount_value: self.discount_value,
            usage_limit: self.usage_limit,
            per_customer_limit: self.per_customer_limit,
            minimum_order_cents: self.minimum_order_cents,
            maximum_discount_cents: self.maximum_discount_cents,
            shipping_discount_percent: self.shipping_discount_percent,
            starts_at: self.starts_at,
            ends_at: self.ends_at,
            stackable: self.stackable,
            first_purchase_only: self.first_purchase_only,
            status: self.status,
            product_scope_mode: self
                .product_scope_mode
                .unwrap_or(CouponProductScopeMode::Include),
            product_ids: self.product_ids,
        }
    }
}

/// A nullable string with the same constraint on the non-null branch.
fn nullable_string(max_length: Option<u32>, min_length: Option<u32>) -> Value {
    let mut text = json!({"type": "string"});
    if let Some(min_length) = min_length {
        text["minLength"] = json!(min_length);
    }
    if let Some(max_length) = max_length {
        text["maxLength"] = json!(max_length);
    }

    json!({"anyOf": [text, {"type": "null"}]})
}

/// One variation payload: an `id` present updates, an omitted one inserts.
fn variation_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": {"type": "string", "minLength": 1, "maxLength": 64},
            "name": {"type": "string", "minLength": 1, "maxLength": 80},
            "priceCents": {"type": "integer", "minimum": 0},
            "stockMode": {"enum": ["controlled", "unlimited"], "type": "string"},
            "stockQty": {"anyOf": [{"type": "integer", "minimum": 0}, {"type": "null"}]},
        },
        "required": ["name", "priceCents", "stockMode", "stockQty"],
        "additionalProperties": false,
    })
}

fn variations_schema() -> Value {
    json!({"type": "array", "items": variation_schema(), "minItems": 1, "maxItems": 50})
}

fn id_list_schema() -> Value {
    json!({"type": "array", "items": {"type": "string", "minLength": 1, "maxLength": 64}})
}

/// The `order_transition` schema.
pub fn order_transition_schema() -> Value {
    schema_with(
        vec![
            ("storeSlug", store_slug()),
            ("orderCode", order_code()),
            ("axis", enum_string(&["financial", "fulfilment"])),
            (
                "to",
                json!({"type": "string", "minLength": 1, "maxLength": 64}),
            ),
            ("reason", json!({"type": "string", "maxLength": 500})),
        ],
        &["storeSlug", "orderCode", "axis", "to"],
        false,
    )
}

/// The `product_create` schema.
pub fn product_create_schema() -> Value {
    schema(
        vec![
            ("storeSlug", store_slug()),
            (
                "name",
                json!({"type": "string", "minLength": 1, "maxLength": 120}),
            ),
            ("description", nullable_string(Some(2000), None)),
            ("subcategoryId", nullable_string(Some(64), Some(1))),
            ("tagIds", id_list_schema()),
            (
                "badgeIds",
                json!({"type": "array", "items": {"type": "string"}}),
            ),
            ("available", json!({"type": "boolean"})),
            ("archived", json!({"type": "boolean"})),
            ("hidden", json!({"type": "boolean"})),
            ("private", json!({"type": "boolean"})),
            ("sortOrder", json!({"type": "integer", "minimum": 0})),
            ("variations", variations_schema()),
        ],
        &[
            "storeSlug",
            "name",
            "description",
            "subcategoryId",
            "tagIds",
            "available",
            "sortOrder",
            "variations",
        ],
    )
}

/// The `product_update` schema.
pub fn product_update_schema() -> Value {
    schema(
        vec![
            ("storeSlug", store_slug()),
            (
                "productId",
                json!({"type": "string", "minLength": 1, "maxLength": 64}),
            ),
            (
                "name",
                json!({"type": "string", "minLength": 1, "maxLength": 120}),
            ),
            ("description", nullable_string(Some(2000), None)),
            ("subcategoryId", nullable_string(Some(64), Some(1))),
            ("tagIds", id_list_schema()),
            (
                "badgeIds",
                json!({"type": "array", "items": {"type": "string"}}),
            ),
            ("available", json!({"type": "boolean"})),
            ("archived", json!({"type": "boolean"})),
            ("hidden", json!({"type": "boolean"})),
            ("private", json!({"type": "boolean"})),
            ("sortOrder", json!({"type": "integer", "minimum": 0})),
            ("variations", variations_schema()),
        ],
        &["storeSlug", "productId"],
    )
}

/// The `coupon_create` schema.
pub fn coupon_create_schema() -> Value {
    let mut product_scope_mode = enum_string(&["include", "exclude"]);
    product_scope_mode["default"] = json!("include");

    let mut product_ids = json!({
        "type": "array",
        "items": {"type": "string", "minLength": 1, "maxLength": 64},
        "maxItems": 200,
    });
    product_ids["default"] = json!([]);

    schema(
        vec![
            ("storeSlug", store_slug()),
            (
                "code",
                json!({"type": "string", "minLength": 1, "maxLength": 64}),
            ),
            ("description", json!({"type": "string", "maxLength": 280})),
            ("discountType", enum_string(&["percentage", "fixed"])),
            ("discountValue", json!({"type": "integer", "minimum": 1})),
            ("usageLimit", json!({"type": "integer", "minimum": 1})),
            ("perCustomerLimit", json!({"type": "integer", "minimum": 1})),
            (
                "minimumOrderCents",
                json!({"type": "integer", "minimum": 0}),
            ),
            (
                "maximumDiscountCents",
                json!({"type": "integer", "minimum": 0}),
            ),
            (
                "shippingDiscountPercent",
                json!({"type": "integer", "minimum": 0, "maximum": 100}),
            ),
            ("startsAt", json!({"type": "string"})),
            ("endsAt", json!({"type": "string"})),
            ("stackable", json!({"type": "boolean"})),
            ("firstPurchaseOnly", json!({"type": "boolean"})),
            ("status", enum_string(&["active", "disabled"])),
            ("productScopeMode", product_scope_mode),
            ("productIds", product_ids),
        ],
        &[
            "storeSlug",
            "code",
            "discountType",
            "discountValue",
            "stackable",
            "firstPurchaseOnly",
            "status",
        ],
    )
}
