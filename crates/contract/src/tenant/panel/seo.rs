//! seo resource DTOs, ported from the Bun panel contract (MEN-253).
//!
//! Two levels: the store-wide settings (templates and social image) and one
//! override row per entity. An override is edited field by field, so a field
//! omitted from `SaveSeoInput` keeps what is stored and an explicit `null`
//! reverts that field; the double `Option` is what tells the two apart.

use crate::ErrorCode;

/// The entity slugs the `SeoMeta.entityType` check constraint accepts.
pub const SEO_ENTITY_TYPES: [SeoEntityType; 7] = [
    SeoEntityType::Store,
    SeoEntityType::Department,
    SeoEntityType::Category,
    SeoEntityType::Tag,
    SeoEntityType::Product,
    SeoEntityType::Kit,
    SeoEntityType::Coupon,
];

/// One kind of page an override can describe.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum SeoEntityType {
    Store,
    Department,
    Category,
    Tag,
    Product,
    Kit,
    Coupon,
}

impl SeoEntityType {
    /// The wire string, which is also the stored value.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Store => "store",
            Self::Department => "department",
            Self::Category => "category",
            Self::Tag => "tag",
            Self::Product => "product",
            Self::Kit => "kit",
            Self::Coupon => "coupon",
        }
    }

    /// Parses a path, query or stored value; an unknown slug is not an entity
    /// this contract knows.
    pub fn parse(raw: &str) -> Option<Self> {
        SEO_ENTITY_TYPES
            .into_iter()
            .find(|entity_type| entity_type.as_str() == raw)
    }
}

/// Which inheritance level won a field. `Store` covers the settings template
/// too: it is store-level configuration.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum SeoSourceLevel {
    Entity,
    Store,
    Default,
}

/// The winning level per inheritable field.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelSeoSource {
    pub title: SeoSourceLevel,
    pub description: SeoSourceLevel,
    pub social_image_url: SeoSourceLevel,
}

/// The values a page renders, resolved entity → store row → settings template
/// → static fallback.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelResolvedSeo {
    pub title: String,
    #[schema(required)]
    pub description: Option<String>,
    #[schema(required)]
    pub canonical_url: Option<String>,
    #[schema(required)]
    pub social_image_url: Option<String>,
    #[schema(required)]
    pub json_ld: Option<String>,
    pub source: PanelSeoSource,
}

/// The store's own defaults: the two templates plus the store-level image.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StoreSeoSettings {
    #[schema(required)]
    pub seo_title_template: Option<String>,
    #[schema(required)]
    pub seo_description_template: Option<String>,
    #[schema(required)]
    pub seo_social_image_url: Option<String>,
}

impl StoreSeoSettings {
    /// Every field unset, the shape a store that never saved SEO reads back as.
    pub fn empty() -> Self {
        Self {
            seo_title_template: None,
            seo_description_template: None,
            seo_social_image_url: None,
        }
    }
}

/// `{ settings, resolved }` for the store-level screen.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StoreSeoOutput {
    pub settings: StoreSeoSettings,
    pub resolved: PanelResolvedSeo,
}

/// The relation an extra `<link>` carries. `sameAs` is the camelCase wire value
/// SERP tooling expects, not an invented slug.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "camelCase")]
pub enum SeoLinkRel {
    Alternate,
    SameAs,
    Related,
}

impl SeoLinkRel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Alternate => "alternate",
            Self::SameAs => "sameAs",
            Self::Related => "related",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "alternate" => Some(Self::Alternate),
            "sameAs" => Some(Self::SameAs),
            "related" => Some(Self::Related),
            _ => None,
        }
    }
}

/// One extra `<link>` relation: an `hreflang` alternate, a `sameAs` profile
/// link or a `related` resource. The canonical URL stays its own single field.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SeoLink {
    pub rel: SeoLinkRel,
    pub href: String,
    #[schema(required)]
    pub hreflang: Option<String>,
}

/// The maximum number of extra links one entity can carry.
pub const SEO_MAX_LINKS: usize = 8;

/// The five editable columns of one override row, plus its extra links.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SeoFields {
    #[schema(required)]
    pub title: Option<String>,
    #[schema(required)]
    pub description: Option<String>,
    #[schema(required)]
    pub canonical_url: Option<String>,
    #[schema(required)]
    pub social_image_url: Option<String>,
    #[schema(required)]
    pub json_ld: Option<String>,
    /// Only product and kit rows carry links; every other entity reads empty.
    pub links: Vec<SeoLink>,
}

/// `{ settings }` write payload; every field is sent, `null` clears it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveStoreSeoInput {
    pub seo_title_template: Option<String>,
    pub seo_description_template: Option<String>,
    pub seo_social_image_url: Option<String>,
}

impl SaveStoreSeoInput {
    /// `seoTitleTemplate` up to 120 characters, `seoDescriptionTemplate` up to
    /// 200; the image URL has no length bound in the contract.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        bounded(self.seo_title_template.as_deref(), 120)?;
        bounded(self.seo_description_template.as_deref(), 200)
    }
}

/// Partial write of one entity's override.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SaveSeoInput {
    #[serde(default, deserialize_with = "nullable_field")]
    pub title: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub canonical_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub social_image_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable_field")]
    pub json_ld: Option<Option<String>>,
    /// Omitted keeps the stored links; an array replaces the whole list, and an
    /// empty array clears it. Only product and kit accept it.
    #[serde(default)]
    pub links: Option<Vec<SeoLink>>,
}

impl SaveSeoInput {
    /// `title` up to 70, `description` up to 200, `jsonLd` up to 4000 and, when
    /// set, valid JSON. The browser parses the block too, but only to point at
    /// the offending line while the merchant types; the API is what refuses to
    /// store a block a crawler would choke on.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        optional_bounded(self.title.as_ref(), 70)?;
        optional_bounded(self.description.as_ref(), 200)?;
        optional_bounded(self.json_ld.as_ref(), 4000)?;

        if let Some(Some(json_ld)) = &self.json_ld {
            let trimmed = json_ld.trim();

            if !trimmed.is_empty() && serde_json::from_str::<serde_json::Value>(trimmed).is_err() {
                return Err(ErrorCode::ValidationFailed);
            }
        }

        if let Some(links) = &self.links {
            if links.len() > SEO_MAX_LINKS {
                return Err(ErrorCode::ValidationFailed);
            }

            for link in links {
                if !is_http_url(&link.href) {
                    return Err(ErrorCode::ValidationFailed);
                }

                bounded(link.hreflang.as_deref(), 20)?;
            }
        }

        Ok(())
    }
}

/// Absolute http(s) URL, the same rule the browser applies to the canonical.
fn is_http_url(value: &str) -> bool {
    let trimmed = value.trim();

    (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
        && trimmed.len() > "https://".len()
}

/// `{ saved, resolved }` after a read, write or revert.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntitySeoOutput {
    pub saved: SeoFields,
    pub resolved: PanelResolvedSeo,
}

/// `?entityType=` filters the list; omitted means every type.
///
/// The slug stays a string here so the handler can answer an unknown one with
/// the catalog's `VALIDATION_FAILED` envelope instead of the extractor's.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListSeoEntitiesInput {
    pub entity_type: Option<String>,
}

/// One row the SEO list screen shows.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SeoEntityItem {
    pub entity_type: SeoEntityType,
    pub entity_id: String,
    pub name: String,
    pub has_override: bool,
}

/// `{ entities }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SeoEntityList {
    pub entities: Vec<SeoEntityItem>,
}

/// `Some(null)` when the field was sent as `null`, `None` when it was omitted.
fn nullable_field<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    <Option<String> as serde::Deserialize>::deserialize(deserializer).map(Some)
}

fn bounded(value: Option<&str>, max: usize) -> Result<(), ErrorCode> {
    match value {
        Some(text) if text.chars().count() > max => Err(ErrorCode::ValidationFailed),
        _ => Ok(()),
    }
}

fn optional_bounded(value: Option<&Option<String>>, max: usize) -> Result<(), ErrorCode> {
    match value {
        Some(Some(text)) => bounded(Some(text), max),
        _ => Ok(()),
    }
}
