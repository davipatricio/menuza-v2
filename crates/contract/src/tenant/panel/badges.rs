//! badges resource DTOs, ported from the Bun panel contract.
//!
//! A badge is a name plus a rendered image URL. The storefront shows the URL
//! as-is, so only absolute `http(s)` addresses are accepted.

use crate::ErrorCode;

/// Longest badge name, counted after trimming.
const BADGE_NAME_MAX: usize = 64;

/// Longest image URL, counted after trimming.
const IMAGE_URL_MAX: usize = 1000;

/// `{ name, imageUrl, sortOrder?, isActive? }`. Order and visibility default to
/// `0` and `true` when omitted.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateBadgeInput {
    pub name: String,
    pub image_url: String,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

impl CreateBadgeInput {
    /// `name`: 1..=64 characters after trimming; `imageUrl`: an absolute
    /// `http(s)` URL no longer than 1000 characters; `sortOrder`: 0 or more.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if !valid_name(&self.name) || !valid_image_url(&self.image_url) {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.sort_order.is_some_and(|order| order < 0) {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ name?, imageUrl?, sortOrder?, isActive? }`. A partial save: an omitted
/// field keeps the stored value.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateBadgeInput {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub image_url: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub is_active: Option<bool>,
}

impl UpdateBadgeInput {
    /// Every field that was sent must pass the create rule.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.name.as_deref().is_some_and(|name| !valid_name(name)) {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .image_url
            .as_deref()
            .is_some_and(|url| !valid_image_url(url))
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.sort_order.is_some_and(|order| order < 0) {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ id, name, imageUrl, sortOrder, isActive, itemsCount }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelBadge {
    pub id: String,
    pub name: String,
    pub image_url: String,
    pub sort_order: i32,
    pub is_active: bool,
    pub items_count: i64,
}

/// `{ badges }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelBadgesOutput {
    pub badges: Vec<PanelBadge>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelBadgeSuccess {
    pub success: bool,
}

/// `name`: 1..=64 characters after trimming.
fn valid_name(name: &str) -> bool {
    let trimmed = name.trim();

    !trimmed.is_empty() && trimmed.chars().count() <= BADGE_NAME_MAX
}

/// An absolute `http(s)` URL: no `data:` and no `javascript:` reach the
/// storefront.
fn valid_image_url(url: &str) -> bool {
    let trimmed = url.trim();
    let lower = trimmed.to_lowercase();

    !trimmed.is_empty()
        && trimmed.chars().count() <= IMAGE_URL_MAX
        && (lower.starts_with("http://") || lower.starts_with("https://"))
}
