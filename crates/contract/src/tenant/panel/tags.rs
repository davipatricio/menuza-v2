//! tags resource DTOs, ported from the Bun panel contract.
//!
//! A tag is a name plus a visibility flag; it is linked to products through
//! `ProductTag`, so the list counts those links.

use super::categories::NAME_MAX;
use crate::ErrorCode;

/// `{ name, isActive }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagInput {
    pub name: String,
    pub is_active: bool,
}

impl TagInput {
    /// `name`: 1..=80 characters after trimming.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.name.trim().is_empty() || self.name.trim().chars().count() > NAME_MAX {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ id, name, isActive, itemsCount }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelTag {
    pub id: String,
    pub name: String,
    pub is_active: bool,
    pub items_count: i64,
}

/// `{ tags }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelTagsOutput {
    pub tags: Vec<PanelTag>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelTagSuccess {
    pub success: bool,
}

/// The sort the tag screen writes to the URL.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListTagsQuery {
    pub sort_by: Option<String>,
    pub order: Option<String>,
}
