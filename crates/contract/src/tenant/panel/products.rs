//! products resource DTOs, ported from the Bun panel contract.
//!
//! A product is written with its variations and its tag and badge links. The
//! list row carries the price window and the stock summary the table renders;
//! the detail adds the description, every variation and the nutrition label.
//! Money lives on the variation, so the product's own price is derived.

use crate::ErrorCode;

/// Longest product name, counted after trimming.
pub const NAME_MAX: usize = 120;

/// Longest description the editor accepts.
pub const DESCRIPTION_MAX: usize = 2000;

/// Longest variation name, counted after trimming.
pub const VARIATION_NAME_MAX: usize = 80;

/// Longest id any input accepts.
pub const ID_MAX: usize = 64;

/// Longest household measure.
pub const HOUSEHOLD_MEASURE_MAX: usize = 80;

/// Longest nutrition note.
pub const NOTES_MAX: usize = 500;

/// Most variations one product carries.
pub const VARIATIONS_MAX: usize = 50;

/// Most products one bulk call accepts.
pub const BULK_MAX: usize = 500;

/// The accepted `sortBy` values.
pub const SORT_FIELDS: [&str; 6] = [
    "sortOrder",
    "name",
    "updatedAt",
    "price",
    "category",
    "stock",
];

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().count() <= ID_MAX
}

fn valid_stock_mode(mode: &str) -> bool {
    matches!(mode, "controlled" | "unlimited")
}

/// A tag as the panel and the storefront both render it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductTag {
    pub id: String,
    pub name: String,
}

/// A badge reference: the image is the whole point.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProductBadgeRef {
    pub id: String,
    pub name: String,
    pub image_url: String,
}

/// The fields every product response carries.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProduct {
    pub id: String,
    pub name: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub subcategory_id: Option<String>,
    pub subcategory_name: Option<String>,
    pub department_ids: Vec<String>,
    pub department_names: Vec<String>,
    pub tags: Vec<PanelProductTag>,
    pub badges: Vec<ProductBadgeRef>,
    pub price_cents: Option<i32>,
    pub available: bool,
    pub archived: bool,
    pub hidden: bool,
    pub private: bool,
    pub sort_order: i32,
    pub updated_at: String,
}

/// A list row: the base product plus the price window and the stock summary.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductList {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub seo_title: Option<String>,
    pub seo_description: Option<String>,
    pub variation_names: Vec<String>,
    pub variation_count: i32,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub subcategory_id: Option<String>,
    pub subcategory_name: Option<String>,
    pub department_ids: Vec<String>,
    pub department_names: Vec<String>,
    pub tags: Vec<PanelProductTag>,
    pub badges: Vec<ProductBadgeRef>,
    pub price_cents: Option<i32>,
    pub price_min_cents: Option<i32>,
    pub price_max_cents: Option<i32>,
    pub stock_qty: Option<i32>,
    pub has_unlimited_stock: bool,
    pub available: bool,
    pub archived: bool,
    pub hidden: bool,
    pub private: bool,
    pub sort_order: i32,
    pub updated_at: String,
}

/// One variation with its price and stock.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductVariation {
    pub id: String,
    pub name: String,
    pub price_cents: i32,
    pub stock_mode: String,
    pub stock_qty: Option<i32>,
}

/// The nutrition label. Nutrients are per 100 g/mL: kcal for energy, mg for
/// the rest; the portion is thousandths of a gram or millilitre.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductNutrition {
    pub basis: String,
    pub label_format: String,
    pub source: String,
    pub reference_at: Option<String>,
    pub energy_kcal: Option<i32>,
    pub carbs_mg: Option<i32>,
    pub total_sugars_mg: Option<i32>,
    pub added_sugars_mg: Option<i32>,
    pub protein_mg: Option<i32>,
    pub total_fat_mg: Option<i32>,
    pub saturated_fat_mg: Option<i32>,
    pub trans_fat_mg: Option<i32>,
    pub fiber_mg: Option<i32>,
    pub sodium_mg: Option<i32>,
    pub portion_milli: Option<i32>,
    pub household_measure: Option<String>,
    pub servings_per_pack: Option<i32>,
    pub show_high_added_sugar: bool,
    pub show_high_sat_fat: bool,
    pub show_high_sodium: bool,
    pub published: bool,
    pub notes: Option<String>,
    pub updated_at: String,
}

/// The editor's read: the base fields, the description, every variation and
/// the optional label.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductDetail {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub subcategory_id: Option<String>,
    pub subcategory_name: Option<String>,
    pub department_ids: Vec<String>,
    pub department_names: Vec<String>,
    pub tags: Vec<PanelProductTag>,
    pub badges: Vec<ProductBadgeRef>,
    pub price_cents: Option<i32>,
    pub available: bool,
    pub archived: bool,
    pub hidden: bool,
    pub private: bool,
    pub sort_order: i32,
    pub updated_at: String,
    pub variations: Vec<PanelProductVariation>,
    pub nutrition: Option<PanelProductNutrition>,
}

/// `{ products }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductsOutput {
    pub products: Vec<PanelProductList>,
}

/// `{ product }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductOutput {
    pub product: PanelProductDetail,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelProductSuccess {
    pub success: bool,
}

/// `{ updated }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelBulkUpdateOutput {
    pub updated: i64,
}

/// One product the bulk delete left alone.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelBulkSkipped {
    pub id: String,
    pub name: String,
}

/// `{ deleted, skipped }`: protected products are skipped, not fatal.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelBulkDeleteOutput {
    pub deleted: i64,
    pub skipped: Vec<PanelBulkSkipped>,
}

/// One variation in a create or update payload. An `id` present updates the
/// row; an omitted one inserts a new variation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProductVariationInput {
    pub id: Option<String>,
    pub name: String,
    pub price_cents: i32,
    pub stock_mode: String,
    pub stock_qty: Option<i32>,
}

impl ProductVariationInput {
    /// `name`: 1..=80 after trimming; `priceCents`: 0 or more; `stockMode`:
    /// `controlled` or `unlimited`; `stockQty` consistent with the mode.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if let Some(id) = &self.id
            && !valid_id(id)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.name.trim().is_empty()
            || self.name.trim().chars().count() > VARIATION_NAME_MAX
            || self.price_cents < 0
            || !valid_stock_mode(&self.stock_mode)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        let stock_ok = match self.stock_mode.as_str() {
            "unlimited" => self.stock_qty.is_none(),
            "controlled" => self.stock_qty.is_some_and(|qty| qty >= 0),
            _ => false,
        };

        if !stock_ok {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ name, description, subcategoryId, tagIds, badgeIds, available, archived,
/// hidden, private, sortOrder, variations }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateProductInput {
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

impl CreateProductInput {
    /// The name is trimmed and must name 1..=120 characters; the optional
    /// description is capped at 2000; ids are 1..=64; at least one variation
    /// and at most 50, each valid and uniquely named once trimmed.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.name.trim().is_empty()
            || self.name.trim().chars().count() > NAME_MAX
            || self.sort_order < 0
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .description
            .as_ref()
            .is_some_and(|text| text.chars().count() > DESCRIPTION_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if let Some(id) = &self.subcategory_id
            && !valid_id(id)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.tag_ids.iter().any(|id| !valid_id(id))
            || self.badge_ids.iter().flatten().any(|id| !valid_id(id))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.variations.is_empty()
            || self.variations.len() > VARIATIONS_MAX
            || self.variations.iter().any(|v| v.validate().is_err())
        {
            return Err(ErrorCode::ValidationFailed);
        }

        unique_variation_names(&self.variations)
    }
}

/// A partial update: an omitted field keeps the stored value, `null` clears
/// the nullable ones. Variations are replaced as a set when present.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateProductInput {
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

impl UpdateProductInput {
    /// Every field present is validated as on create; an omitted one is left
    /// untouched.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if let Some(name) = &self.name
            && (name.trim().is_empty() || name.trim().chars().count() > NAME_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .description
            .as_ref()
            .and_then(|value| value.as_ref())
            .is_some_and(|text| text.chars().count() > DESCRIPTION_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .subcategory_id
            .as_ref()
            .and_then(|value| value.as_ref())
            .is_some_and(|id| !valid_id(id))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .tag_ids
            .iter()
            .flatten()
            .chain(self.badge_ids.iter().flatten())
            .any(|id| !valid_id(id))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.sort_order.is_some_and(|order| order < 0) {
            return Err(ErrorCode::ValidationFailed);
        }

        if let Some(variations) = &self.variations {
            if variations.is_empty()
                || variations.len() > VARIATIONS_MAX
                || variations.iter().any(|v| v.validate().is_err())
            {
                return Err(ErrorCode::ValidationFailed);
            }

            unique_variation_names(variations)?;
        }

        Ok(())
    }
}

/// `{ sortBy, order }`: the two knobs the catalog table writes to the URL.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListProductsQuery {
    pub sort_by: Option<String>,
    pub order: Option<String>,
}

/// A partial label save, merged onto the stored row before validation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveProductNutritionInput {
    pub basis: Option<String>,
    pub label_format: Option<String>,
    pub source: Option<String>,
    pub reference_at: Option<Option<String>>,
    pub energy_kcal: Option<Option<i32>>,
    pub carbs_mg: Option<Option<i32>>,
    pub total_sugars_mg: Option<Option<i32>>,
    pub added_sugars_mg: Option<Option<i32>>,
    pub protein_mg: Option<Option<i32>>,
    pub total_fat_mg: Option<Option<i32>>,
    pub saturated_fat_mg: Option<Option<i32>>,
    pub trans_fat_mg: Option<Option<i32>>,
    pub fiber_mg: Option<Option<i32>>,
    pub sodium_mg: Option<Option<i32>>,
    pub portion_milli: Option<Option<i32>>,
    pub household_measure: Option<Option<String>>,
    pub servings_per_pack: Option<Option<i32>>,
    pub show_high_added_sugar: Option<bool>,
    pub show_high_sat_fat: Option<bool>,
    pub show_high_sodium: Option<bool>,
    pub published: Option<bool>,
    pub notes: Option<Option<String>>,
}

impl SaveProductNutritionInput {
    /// The picklists, the timestamp, the number signs and the two cross-field
    /// ordering rules a single payload can already judge.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if let Some(basis) = &self.basis
            && !matches!(basis.as_str(), "solid" | "liquid")
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if let Some(format) = &self.label_format
            && !matches!(format.as_str(), "vertical" | "simplified")
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if let Some(source) = &self.source
            && !matches!(
                source.as_str(),
                "manual" | "lab" | "supplier_label" | "database" | "estimate"
            )
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .reference_at
            .as_ref()
            .and_then(|value| value.as_ref())
            .is_some_and(|value| chrono::DateTime::parse_from_rfc3339(value).is_err())
        {
            return Err(ErrorCode::ValidationFailed);
        }

        let nutrients = [
            self.energy_kcal,
            self.carbs_mg,
            self.total_sugars_mg,
            self.added_sugars_mg,
            self.protein_mg,
            self.total_fat_mg,
            self.saturated_fat_mg,
            self.trans_fat_mg,
            self.fiber_mg,
            self.sodium_mg,
        ];

        if nutrients.iter().flatten().flatten().any(|value| *value < 0)
            || self.portion_milli.flatten().is_some_and(|value| value < 1)
            || self
                .servings_per_pack
                .flatten()
                .is_some_and(|value| value < 1)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .household_measure
            .as_ref()
            .and_then(|value| value.as_ref())
            .is_some_and(|text| text.chars().count() > HOUSEHOLD_MEASURE_MAX)
            || self
                .notes
                .as_ref()
                .and_then(|value| value.as_ref())
                .is_some_and(|text| text.chars().count() > NOTES_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if let (Some(Some(added)), Some(Some(total))) = (self.added_sugars_mg, self.total_sugars_mg)
            && added > total
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if let (Some(Some(saturated)), Some(Some(trans)), Some(Some(total))) =
            (self.saturated_fat_mg, self.trans_fat_mg, self.total_fat_mg)
            && saturated.saturating_add(trans) > total
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// One round trip for the table's bulk bar. Tags are added, never replaced.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BulkUpdateProductsInput {
    pub product_ids: Vec<String>,
    pub available: Option<bool>,
    pub add_tag_ids: Option<Vec<String>>,
    pub subcategory_id: Option<Option<String>>,
}

impl BulkUpdateProductsInput {
    /// 1..=500 valid ids, at least one change, every tag id and the
    /// subcategory id 1..=64 characters.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.product_ids.is_empty()
            || self.product_ids.len() > BULK_MAX
            || self.product_ids.iter().any(|id| !valid_id(id))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.available.is_none() && self.add_tag_ids.is_none() && self.subcategory_id.is_none() {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.add_tag_ids.iter().flatten().any(|id| !valid_id(id))
            || self
                .subcategory_id
                .as_ref()
                .and_then(|value| value.as_ref())
                .is_some_and(|id| !valid_id(id))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ productIds }` for the bulk delete.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BulkDeleteProductsInput {
    pub product_ids: Vec<String>,
}

impl BulkDeleteProductsInput {
    /// 1..=500 valid ids.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.product_ids.is_empty()
            || self.product_ids.len() > BULK_MAX
            || self.product_ids.iter().any(|id| !valid_id(id))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// Two variations with one name would trip the `(productId, name)` unique.
fn unique_variation_names(variations: &[ProductVariationInput]) -> Result<(), ErrorCode> {
    let mut seen = std::collections::HashSet::new();

    for variation in variations {
        if !seen.insert(variation.name.trim()) {
            return Err(ErrorCode::Conflict);
        }
    }

    Ok(())
}
