//! kits resource DTOs.
//!
//! A kit is a composed product: the buyer picks quantities of the dishes the
//! manager listed. Three shapes share one resource:
//!
//! - `fixed`: every dish carries a locked quantity.
//! - `custom_quantities`: each dish carries its own minimum and maximum.
//! - `fixed_total`: only the kit total is locked; each dish is free within it.
//!
//! Pricing is resolved in one order, always server-side: the base (`fixed`) or
//! the sum of the chosen variations floored by the base (`sum`), then the kit
//! percentage, then the progressive band for the kit count in the order.
//!
//! Stock is never the kit's: every chosen dish debits its own variation
//! (MEN-83).

use crate::ErrorCode;

/// Longest kit name, counted after trimming.
pub const NAME_MAX: usize = 120;

/// Longest kit slug.
pub const SLUG_MAX: usize = 80;

/// Longest kit description the editor accepts.
pub const DESCRIPTION_MAX: usize = 2000;

/// Longest image URL.
pub const IMAGE_URL_MAX: usize = 500;

/// Longest id any input accepts.
pub const ID_MAX: usize = 64;

/// Longest group label, counted after trimming.
pub const GROUP_NAME_MAX: usize = 60;

/// Most groups one kit carries.
pub const GROUPS_MAX: usize = 20;

/// Most dish entries one kit carries.
pub const ITEMS_MAX: usize = 200;

/// Most progressive bands one kit carries.
pub const BANDS_MAX: usize = 20;

/// Most alternate variations one dish entry offers.
pub const SWAPS_MAX: usize = 50;

/// How the dish quantities are locked.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum KitKind {
    /// Every dish has a locked quantity.
    Fixed,
    /// Every dish has its own minimum and maximum.
    CustomQuantities,
    /// Only the kit total is locked.
    FixedTotal,
}

/// How the kit price is computed before the percentage and the bands.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum KitPricingMode {
    /// `baseCents` is the price; the dishes do not sum.
    Fixed,
    /// `max(baseCents, sum of the chosen variations)`.
    Sum,
}

/// What the storefront does once the minimums can no longer be composed.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum KitUnavailableBehavior {
    /// Drop the kit from the storefront listing.
    Hide,
    /// Keep it listed and refuse to check it out.
    Block,
}

/// A group of dishes, with optional bounds on the units it accepts.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitGroup {
    pub id: String,
    pub name: String,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
    #[serde(default)]
    pub sort_order: i32,
}

/// One dish in the kit, bound to the variation the manager chose.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitItem {
    pub id: String,
    pub product_id: String,
    pub product_name: Option<String>,
    pub variation_id: String,
    pub variation_name: Option<String>,
    pub group_id: Option<String>,
    /// Locked quantity; only the `fixed` kind carries it.
    pub quantity: Option<i32>,
    pub min_qty: Option<i32>,
    pub max_qty: Option<i32>,
    #[serde(default = "default_step")]
    pub step: i32,
    /// When true the buyer may pick another variation from `swapVariationIds`.
    pub allow_swap: bool,
    pub swap_variation_ids: Vec<String>,
    pub sort_order: i32,
}

/// One progressive band: from `min_quantity` kits up, take `percent` off.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitBand {
    pub id: String,
    pub min_quantity: i32,
    pub percent: i32,
}

/// A list row.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKit {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub kind: KitKind,
    pub pricing_mode: KitPricingMode,
    pub base_cents: i32,
    pub percent_off: Option<i32>,
    pub available: bool,
    pub archived: bool,
    pub items_count: i64,
    pub updated_at: String,
}

/// The editor's read: the row plus groups, dishes and bands.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitDetail {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub image_url: String,
    pub kind: KitKind,
    pub pricing_mode: KitPricingMode,
    pub base_cents: i32,
    pub percent_off: Option<i32>,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
    pub max_kits_per_order: Option<i32>,
    pub unavailable_behavior: KitUnavailableBehavior,
    pub coupon_stackable: bool,
    pub sort_order: i32,
    pub available: bool,
    pub archived: bool,
    pub updated_at: String,
    pub groups: Vec<PanelKitGroup>,
    pub items: Vec<PanelKitItem>,
    pub bands: Vec<PanelKitBand>,
}

/// `{ kits }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitsOutput {
    pub kits: Vec<PanelKit>,
}

/// `{ kit }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitOutput {
    pub kit: PanelKitDetail,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitSuccess {
    pub success: bool,
}

/// One variation a dish can point at.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitOptionVariation {
    pub id: String,
    pub name: String,
    pub price_cents: i32,
}

/// One product the kit editor can add as a dish.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitOptionProduct {
    pub id: String,
    pub name: String,
    pub available: bool,
    pub image_url: Option<String>,
    pub category_name: Option<String>,
    pub variations: Vec<PanelKitOptionVariation>,
}

/// `{ products }`: the catalog the kit editor picks dishes from.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitOptionsOutput {
    pub products: Vec<PanelKitOptionProduct>,
}

/// One group in a create or update payload.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KitGroupInput {
    /// Client-assigned id, stable across a reorder. The editor mints one for a
    /// new group so a dish can name it in the same payload.
    pub id: String,
    pub name: String,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
    #[serde(default)]
    pub sort_order: i32,
}

/// One dish in a create or update payload.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KitItemInput {
    pub id: Option<String>,
    pub product_id: String,
    pub variation_id: String,
    pub group_id: Option<String>,
    pub quantity: Option<i32>,
    pub min_qty: Option<i32>,
    pub max_qty: Option<i32>,
    #[serde(default = "default_step")]
    pub step: i32,
    pub allow_swap: bool,
    #[serde(default)]
    pub swap_variation_ids: Vec<String>,
    #[serde(default)]
    pub sort_order: i32,
}

/// One progressive band in a create or update payload.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KitBandInput {
    pub min_quantity: i32,
    pub percent: i32,
}

/// A whole kit. Groups, dishes and bands travel with it: the write replaces
/// the full set.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateKitInput {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub image_url: String,
    pub kind: KitKind,
    pub pricing_mode: KitPricingMode,
    pub base_cents: i32,
    pub percent_off: Option<i32>,
    pub min_items: Option<i32>,
    pub max_items: Option<i32>,
    pub max_kits_per_order: Option<i32>,
    pub unavailable_behavior: KitUnavailableBehavior,
    pub coupon_stackable: Option<bool>,
    #[serde(default)]
    pub sort_order: i32,
    pub available: bool,
    pub archived: Option<bool>,
    pub groups: Vec<KitGroupInput>,
    pub items: Vec<KitItemInput>,
    pub bands: Vec<KitBandInput>,
}

impl CreateKitInput {
    pub fn validate(&self) -> Result<(), ErrorCode> {
        validate_name(&self.name)?;
        validate_slug(&self.slug)?;
        validate_description(self.description.as_deref())?;
        validate_image_url(&self.image_url)?;
        validate_bounds(self.min_items, self.max_items)?;
        validate_percent_off(self.percent_off)?;

        // The total is the only lock a `fixed_total` kit has.
        if self.kind == KitKind::FixedTotal
            && (self.min_items.is_none() || self.max_items.is_none())
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.base_cents < 0 || self.sort_order < 0 {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.max_kits_per_order.is_some_and(|value| value < 1) {
            return Err(ErrorCode::ValidationFailed);
        }

        validate_groups(&self.groups)?;
        validate_items(&self.items, Some(self.kind), Some(&self.groups))?;
        validate_bands(&self.bands)?;

        Ok(())
    }
}

/// A partial update: an omitted field keeps the stored value, `null` clears
/// the nullable ones. Groups, dishes and bands are replaced as a set when
/// present, so the handler validates them against the merged kit.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateKitInput {
    pub name: Option<String>,
    pub slug: Option<String>,
    #[serde(default, deserialize_with = "nullable_string")]
    pub description: Option<Option<String>>,
    pub image_url: Option<String>,
    pub kind: Option<KitKind>,
    pub pricing_mode: Option<KitPricingMode>,
    pub base_cents: Option<i32>,
    #[serde(default, deserialize_with = "nullable_i32")]
    pub percent_off: Option<Option<i32>>,
    #[serde(default, deserialize_with = "nullable_i32")]
    pub min_items: Option<Option<i32>>,
    #[serde(default, deserialize_with = "nullable_i32")]
    pub max_items: Option<Option<i32>>,
    #[serde(default, deserialize_with = "nullable_i32")]
    pub max_kits_per_order: Option<Option<i32>>,
    pub unavailable_behavior: Option<KitUnavailableBehavior>,
    pub coupon_stackable: Option<bool>,
    pub sort_order: Option<i32>,
    pub available: Option<bool>,
    pub archived: Option<bool>,
    pub groups: Option<Vec<KitGroupInput>>,
    pub items: Option<Vec<KitItemInput>>,
    pub bands: Option<Vec<KitBandInput>>,
}

impl UpdateKitInput {
    /// Validates what a single payload can judge. The cross-field rules that
    /// need the stored row (bounds against the merged kit, a group a dish
    /// names, a dish left without a group) are checked by the handler once it
    /// has merged this payload onto the row.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if let Some(name) = &self.name {
            validate_name(name)?;
        }

        if let Some(slug) = &self.slug {
            validate_slug(slug)?;
        }

        validate_description(self.description.as_ref().and_then(|value| value.as_deref()))?;

        if let Some(image_url) = &self.image_url {
            validate_image_url(image_url)?;
        }

        validate_percent_off(self.percent_off.flatten())?;

        if self.base_cents.is_some_and(|value| value < 0)
            || self.sort_order.is_some_and(|value| value < 0)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .max_kits_per_order
            .flatten()
            .is_some_and(|value| value < 1)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if let Some(groups) = &self.groups {
            validate_groups(groups)?;
        }

        if let Some(items) = &self.items {
            validate_items(items, self.kind, None)?;
        }

        if let Some(bands) = &self.bands {
            validate_bands(bands)?;
        }

        Ok(())
    }
}

/// One group in a create or update payload is well formed.
pub fn validate_group(group: &KitGroupInput) -> Result<(), ErrorCode> {
    if group.name.trim().is_empty()
        || group.name.trim().chars().count() > GROUP_NAME_MAX
        || group.sort_order < 0
        || !valid_id(&group.id)
    {
        return Err(ErrorCode::ValidationFailed);
    }

    validate_bounds(group.min_items, group.max_items)
}

fn validate_groups(groups: &[KitGroupInput]) -> Result<(), ErrorCode> {
    if groups.len() > GROUPS_MAX {
        return Err(ErrorCode::ValidationFailed);
    }

    let mut seen = std::collections::HashSet::new();

    for group in groups {
        validate_group(group)?;

        if !seen.insert(group.id.as_str()) {
            return Err(ErrorCode::Conflict);
        }
    }

    Ok(())
}

/// One dish entry is well formed for the given kind.
pub fn validate_item(item: &KitItemInput, kind: Option<KitKind>) -> Result<(), ErrorCode> {
    if !valid_id(&item.product_id)
        || !valid_id(&item.variation_id)
        || item.id.as_ref().is_some_and(|id| !valid_id(id))
        || item.group_id.as_ref().is_some_and(|id| !valid_id(id))
        || item.step < 1
        || item.sort_order < 0
        || !multiple_of_step(item.min_qty, item.step)
        || !multiple_of_step(item.max_qty, item.step)
    {
        return Err(ErrorCode::ValidationFailed);
    }

    validate_bounds(item.min_qty, item.max_qty)?;

    match kind {
        Some(KitKind::Fixed)
            if item.quantity.is_none_or(|value| value < 1)
                || item.min_qty.is_some()
                || item.max_qty.is_some() =>
        {
            return Err(ErrorCode::ValidationFailed);
        }
        Some(KitKind::CustomQuantities) if item.quantity.is_some() => {
            return Err(ErrorCode::ValidationFailed);
        }
        Some(KitKind::FixedTotal) if item.quantity.is_some() => {
            return Err(ErrorCode::ValidationFailed);
        }
        _ => {}
    }

    if !item.allow_swap && !item.swap_variation_ids.is_empty() {
        return Err(ErrorCode::ValidationFailed);
    }

    if item.swap_variation_ids.len() > SWAPS_MAX
        || item.swap_variation_ids.iter().any(|id| !valid_id(id))
    {
        return Err(ErrorCode::ValidationFailed);
    }

    let mut seen = std::collections::HashSet::new();

    for id in &item.swap_variation_ids {
        if !seen.insert(id) {
            return Err(ErrorCode::Conflict);
        }
    }

    Ok(())
}

fn validate_items(
    items: &[KitItemInput],
    kind: Option<KitKind>,
    groups: Option<&[KitGroupInput]>,
) -> Result<(), ErrorCode> {
    if items.is_empty() || items.len() > ITEMS_MAX {
        return Err(ErrorCode::ValidationFailed);
    }

    for item in items {
        validate_item(item, kind)?;
    }

    if let Some(groups) = groups {
        let ids = groups
            .iter()
            .map(|group| group.id.as_str())
            .collect::<std::collections::HashSet<_>>();

        for item in items {
            if let Some(group_id) = &item.group_id
                && !ids.contains(group_id.as_str())
            {
                return Err(ErrorCode::ValidationFailed);
            }
        }

        // A group with no dish is a label the buyer can never satisfy.
        for group in groups {
            if !items
                .iter()
                .any(|item| item.group_id.as_deref() == Some(group.id.as_str()))
            {
                return Err(ErrorCode::ValidationFailed);
            }
        }
    }

    Ok(())
}

fn validate_bands(bands: &[KitBandInput]) -> Result<(), ErrorCode> {
    if bands.len() > BANDS_MAX {
        return Err(ErrorCode::ValidationFailed);
    }

    let mut thresholds = bands
        .iter()
        .map(|band| band.min_quantity)
        .collect::<Vec<_>>();

    if bands
        .iter()
        .any(|band| band.percent < 1 || band.percent > 100 || band.min_quantity < 2)
    {
        return Err(ErrorCode::ValidationFailed);
    }

    thresholds.sort_unstable();

    if thresholds.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(ErrorCode::Conflict);
    }

    Ok(())
}

fn validate_name(name: &str) -> Result<(), ErrorCode> {
    if name.trim().is_empty() || name.trim().chars().count() > NAME_MAX {
        return Err(ErrorCode::ValidationFailed);
    }

    Ok(())
}

fn validate_slug(slug: &str) -> Result<(), ErrorCode> {
    let valid = !slug.is_empty()
        && slug.chars().count() <= SLUG_MAX
        && !slug.starts_with('-')
        && !slug.ends_with('-')
        && slug
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-');

    if valid {
        Ok(())
    } else {
        Err(ErrorCode::ValidationFailed)
    }
}

fn validate_description(description: Option<&str>) -> Result<(), ErrorCode> {
    if description.is_some_and(|text| text.chars().count() > DESCRIPTION_MAX) {
        return Err(ErrorCode::ValidationFailed);
    }

    Ok(())
}

fn validate_image_url(image_url: &str) -> Result<(), ErrorCode> {
    if image_url.trim().is_empty() || image_url.chars().count() > IMAGE_URL_MAX {
        return Err(ErrorCode::ValidationFailed);
    }

    Ok(())
}

fn validate_percent_off(percent_off: Option<i32>) -> Result<(), ErrorCode> {
    if percent_off.is_some_and(|value| !(0..=100).contains(&value)) {
        return Err(ErrorCode::ValidationFailed);
    }

    Ok(())
}

fn validate_bounds(min: Option<i32>, max: Option<i32>) -> Result<(), ErrorCode> {
    if min.is_some_and(|value| value < 0) || max.is_some_and(|value| value < 1) {
        return Err(ErrorCode::ValidationFailed);
    }

    if let (Some(min), Some(max)) = (min, max)
        && min > max
    {
        return Err(ErrorCode::ValidationFailed);
    }

    Ok(())
}

/// `Some(null)` when the field was sent as `null`, `None` when it was omitted.
fn nullable_string<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    <Option<String> as serde::Deserialize>::deserialize(deserializer).map(Some)
}

/// `Some(null)` when the field was sent as `null`, `None` when it was omitted.
fn nullable_i32<'de, D>(deserializer: D) -> Result<Option<Option<i32>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    <Option<i32> as serde::Deserialize>::deserialize(deserializer).map(Some)
}

fn default_step() -> i32 {
    1
}

fn multiple_of_step(value: Option<i32>, step: i32) -> bool {
    value.is_none_or(|value| value % step == 0)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().count() <= ID_MAX
}

#[cfg(test)]
mod tests {
    use super::*;

    fn group(id: &str, min_items: Option<i32>, max_items: Option<i32>) -> KitGroupInput {
        KitGroupInput {
            id: id.to_string(),
            name: "Proteína".to_string(),
            min_items,
            max_items,
            sort_order: 0,
        }
    }

    fn item(kind: KitKind) -> KitItemInput {
        KitItemInput {
            id: None,
            product_id: "prod-1".to_string(),
            variation_id: "var-1".to_string(),
            group_id: Some("group-1".to_string()),
            quantity: (kind == KitKind::Fixed).then_some(1),
            min_qty: None,
            max_qty: None,
            step: 1,
            allow_swap: false,
            swap_variation_ids: Vec::new(),
            sort_order: 0,
        }
    }

    fn input(kind: KitKind) -> CreateKitInput {
        CreateKitInput {
            name: "Kit 10 almoços".to_string(),
            slug: "kit-10-almocos".to_string(),
            description: None,
            image_url: "https://cdn.example/kit.png".to_string(),
            kind,
            pricing_mode: KitPricingMode::Fixed,
            base_cents: 10_000,
            percent_off: None,
            min_items: Some(10),
            max_items: Some(10),
            max_kits_per_order: None,
            unavailable_behavior: KitUnavailableBehavior::Block,
            coupon_stackable: None,
            sort_order: 0,
            available: true,
            archived: None,
            groups: vec![group("group-1", None, None)],
            items: vec![item(kind)],
            bands: Vec::new(),
        }
    }

    #[test]
    fn accepts_a_fixed_kit() {
        assert_eq!(input(KitKind::Fixed).validate(), Ok(()));
    }

    #[test]
    fn fixed_requires_a_locked_quantity() {
        let mut kit = input(KitKind::Fixed);
        kit.items[0].quantity = None;

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn non_fixed_kit_refuses_a_locked_quantity() {
        let mut kit = input(KitKind::CustomQuantities);
        kit.items[0].quantity = Some(2);

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn bounds_must_be_ordered() {
        let mut kit = input(KitKind::Fixed);
        kit.groups = vec![group("group-1", Some(5), Some(2))];

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn per_item_bounds_must_be_multiples_of_the_step() {
        let mut kit = input(KitKind::CustomQuantities);
        kit.items[0].step = 2;
        kit.items[0].max_qty = Some(5);

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn a_group_without_a_dish_is_refused() {
        let mut kit = input(KitKind::Fixed);
        kit.groups.push(group("group-2", None, None));

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn a_dish_must_name_a_known_group() {
        let mut kit = input(KitKind::Fixed);
        kit.items[0].group_id = Some("missing".to_string());

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn a_kit_needs_a_dish() {
        let mut kit = input(KitKind::Fixed);
        kit.items.clear();

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn swaps_are_only_valid_with_allow_swap() {
        let mut kit = input(KitKind::CustomQuantities);
        kit.items[0].swap_variation_ids = vec!["var-2".to_string()];

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn bands_need_distinct_thresholds() {
        let mut kit = input(KitKind::Fixed);
        kit.bands = vec![
            KitBandInput {
                min_quantity: 3,
                percent: 5,
            },
            KitBandInput {
                min_quantity: 3,
                percent: 10,
            },
        ];

        assert_eq!(kit.validate(), Err(ErrorCode::Conflict));
    }

    #[test]
    fn bands_need_at_least_two_kits() {
        let mut kit = input(KitKind::Fixed);
        kit.bands = vec![KitBandInput {
            min_quantity: 1,
            percent: 5,
        }];

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn slug_stays_lowercase_ascii() {
        let mut kit = input(KitKind::Fixed);
        kit.slug = "Kit 10".to_string();

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn a_kit_needs_an_image() {
        let mut kit = input(KitKind::Fixed);
        kit.image_url = "  ".to_string();

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn percent_off_stays_within_zero_and_hundred() {
        let mut kit = input(KitKind::Fixed);
        kit.percent_off = Some(101);

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn update_only_validates_what_it_carries() {
        let input = UpdateKitInput {
            name: Some("  ".to_string()),
            ..Default::default()
        };

        assert_eq!(input.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn fixed_refuses_per_item_bounds() {
        let mut kit = input(KitKind::Fixed);
        kit.items[0].max_qty = Some(2);

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn fixed_total_requires_the_kit_bounds() {
        let mut kit = input(KitKind::FixedTotal);
        kit.min_items = None;

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn fixed_total_allows_dish_bounds_but_disallows_quantity() {
        let mut kit = input(KitKind::FixedTotal);
        kit.items[0].min_qty = Some(1);
        kit.items[0].max_qty = Some(4);
        assert_eq!(kit.validate(), Ok(()));

        kit.items[0].quantity = Some(2);
        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn update_skips_the_kind_rules_when_kind_is_absent() {
        let input = UpdateKitInput {
            items: Some(vec![item(KitKind::Fixed)]),
            ..Default::default()
        };

        assert_eq!(input.validate(), Ok(()));
    }

    #[test]
    fn an_omitted_field_keeps_its_value_and_null_clears_it() {
        let omitted: UpdateKitInput = serde_json::from_str(r#"{"name":"Kit"}"#).unwrap();
        assert_eq!(omitted.percent_off, None);

        let cleared: UpdateKitInput = serde_json::from_str(r#"{"percentOff":null}"#).unwrap();
        assert_eq!(cleared.percent_off, Some(None));

        let set: UpdateKitInput = serde_json::from_str(r#"{"percentOff":10}"#).unwrap();
        assert_eq!(set.percent_off, Some(Some(10)));
    }

    #[test]
    fn a_group_needs_an_id_even_with_no_dish() {
        let mut kit = input(KitKind::Fixed);
        kit.groups[0].id = "  ".to_string();

        assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
    }

    #[test]
    fn step_defaults_to_one() {
        let item: KitItemInput = serde_json::from_str(
            r#"{"productId":"prod-1","variationId":"var-1","allowSwap":false}"#,
        )
        .unwrap();

        assert_eq!(item.step, 1);
        assert_eq!(item.sort_order, 0);
    }

    #[test]
    fn duplicate_swaps_conflict() {
        let mut kit = input(KitKind::CustomQuantities);
        kit.items[0].allow_swap = true;
        kit.items[0].swap_variation_ids = vec!["var-2".to_string(), "var-2".to_string()];

        assert_eq!(kit.validate(), Err(ErrorCode::Conflict));
    }

    #[test]
    fn percent_off_accepts_both_edges() {
        let mut kit = input(KitKind::Fixed);
        kit.percent_off = Some(0);
        assert_eq!(kit.validate(), Ok(()));

        kit.percent_off = Some(100);
        assert_eq!(kit.validate(), Ok(()));
    }

    #[test]
    fn a_band_needs_a_positive_percent() {
        let mut kit = input(KitKind::Fixed);

        for percent in [0, 101] {
            kit.bands = vec![KitBandInput {
                min_quantity: 3,
                percent,
            }];

            assert_eq!(kit.validate(), Err(ErrorCode::ValidationFailed));
        }
    }

    #[test]
    fn the_wire_shape_is_lowercase_slugs() {
        let json = serde_json::to_string(&KitKind::CustomQuantities).unwrap();
        assert_eq!(json, "\"custom_quantities\"");

        let json = serde_json::to_string(&KitPricingMode::Sum).unwrap();
        assert_eq!(json, "\"sum\"");

        let json = serde_json::to_string(&KitUnavailableBehavior::Hide).unwrap();
        assert_eq!(json, "\"hide\"");
    }
}
