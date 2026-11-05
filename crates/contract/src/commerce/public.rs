//! public subdomain DTOs, ported from the Bun contract.
//!
//! The storefront's read surface (MEN-260): the tenant comes from the resolved
//! host, never from the client, so these are output shapes only.

/// The resolved SEO of one page: an entity's own override, the store's row and
/// the store templates behind it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicSeo {
    pub title: String,
    pub description: Option<String>,
    pub social_image_url: Option<String>,
    pub canonical_url: Option<String>,
    pub json_ld: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicStore {
    pub tenant_id: Option<String>,
    pub slug: String,
    pub display_name: String,
    pub seo: PublicSeo,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicBadge {
    pub id: String,
    pub name: String,
    pub image_url: String,
}

/// One sellable product as the menu renders it. No stock, no cost, no hidden rows.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicProduct {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub image_url: Option<String>,
    pub available: bool,
    pub archived: bool,
    pub sort_order: i32,
    pub from_price_cents: i32,
    pub variations: Vec<PublicVariation>,
    pub tags: Vec<String>,
    pub badges: Vec<PublicBadge>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicVariation {
    pub id: String,
    pub name: String,
    pub price_cents: i32,
    pub available: bool,
}

/// A published nutrition label. `published` itself never crosses the wire: only
/// a complete, intentionally published row reaches the browser. Measures follow
/// the panel contract: kcal for energy, mg for the rest, thousandths of a
/// gram/mL for the portion.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicNutrition {
    pub basis: NutritionBasis,
    pub label_format: NutritionLabelFormat,
    pub source: NutritionSource,
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
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum NutritionBasis {
    Solid,
    Liquid,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum NutritionLabelFormat {
    Vertical,
    Simplified,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum NutritionSource {
    Manual,
    Lab,
    SupplierLabel,
    Database,
    Estimate,
}

/// The direct-URL product adds the label and its own SEO; the menu listing stays
/// lean, because a card never renders the structured data of its item.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicProductDetail {
    #[serde(flatten)]
    pub product: PublicProduct,
    pub nutrition: Option<PublicNutrition>,
    pub seo: PublicSeo,
}

/// The storefront menu is nested three levels deep: department > category >
/// subcategory, with the products last. Departments are ordered by name (they
/// have no `sortOrder` column); categories and subcategories by `sortOrder`,
/// then name. Inactive levels and empty groups are dropped server-side.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicMenu {
    pub departments: Vec<PublicDepartment>,
    pub uncategorized: Vec<PublicProduct>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicDepartment {
    pub id: String,
    pub name: String,
    pub categories: Vec<PublicCategory>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicCategory {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub subcategories: Vec<PublicSubcategory>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicSubcategory {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub products: Vec<PublicProduct>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicSitemap {
    pub entries: Vec<PublicSitemapEntry>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicSitemapEntry {
    pub path: String,
    pub last_modified: String,
    pub change_frequency: ChangeFrequency,
    pub priority: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ChangeFrequency {
    Daily,
    Weekly,
    Monthly,
}

/// One dish the buyer may put in a kit, with the variation the store locked and
/// the ones it opened for swapping.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicKitItem {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub variation_id: String,
    pub variation_name: String,
    /// Price of the locked variation; the composer shows it and the sum mode
    /// adds it up.
    pub price_cents: i32,
    pub group_id: Option<String>,
    /// The locked amount of a `fixed` kit; null for a composed one.
    pub quantity: Option<i32>,
    pub min_qty: Option<i32>,
    pub max_qty: Option<i32>,
    pub step: i32,
    pub allow_swap: bool,
    /// Variations the buyer may pick instead of the locked one, already
    /// limited to what the manager allowed.
    pub swap_variations: Vec<PublicKitSwap>,
    /// False when the chosen variation has no stock left; the dish stays
    /// visible and the composer blocks it.
    pub available: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicKitSwap {
    pub id: String,
    pub name: String,
    pub price_cents: i32,
    pub available: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicKitGroup {
    pub id: String,
    pub name: String,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicKitBand {
    pub min_quantity: i32,
    pub percent: i32,
}

/// A kit as the storefront composes it. `base_cents` is what the card shows:
/// the charged price for a fixed kit, the floor for a summed one.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicKit {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub image_url: String,
    pub kind: String,
    pub pricing_mode: String,
    pub base_cents: i32,
    pub percent_off: Option<i32>,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
    pub max_kits_per_order: Option<i32>,
    /// False when the kit cannot reach its own minimums right now.
    pub available: bool,
    pub groups: Vec<PublicKitGroup>,
    pub items: Vec<PublicKitItem>,
    pub bands: Vec<PublicKitBand>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicKitsOutput {
    pub kits: Vec<PublicKit>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PublicKitOutput {
    pub kit: Option<PublicKit>,
}
