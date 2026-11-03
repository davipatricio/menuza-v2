//! subcategories resource DTOs, ported from the Bun panel contract.
//!
//! A subcategory hangs off exactly one category and is where products attach,
//! so every write names its category.

use super::categories::{ID_MAX, NAME_MAX};
use crate::ErrorCode;

/// `{ name, categoryId, sortOrder, active }`, for create and update alike.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubcategoryInput {
    pub name: String,
    pub category_id: String,
    pub sort_order: i32,
    pub active: bool,
}

impl SubcategoryInput {
    /// `name`: 1..=80 characters after trimming; `categoryId`: 1..=64
    /// characters; `sortOrder`: 0 or more.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.name.trim().is_empty()
            || self.name.trim().chars().count() > NAME_MAX
            || self.sort_order < 0
            || self.category_id.is_empty()
            || self.category_id.chars().count() > ID_MAX
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ id, name, categoryId, categoryName, active, sortOrder, itemsCount,
/// updatedAt }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelSubcategory {
    pub id: String,
    pub name: String,
    pub category_id: String,
    pub category_name: String,
    pub active: bool,
    pub sort_order: i32,
    pub items_count: i64,
    pub updated_at: String,
}

/// `{ subcategories }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelSubcategoriesOutput {
    pub subcategories: Vec<PanelSubcategory>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelSubcategorySuccess {
    pub success: bool,
}

/// The filters the subcategory screen writes to the URL.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSubcategoriesQuery {
    pub q: Option<String>,
    pub status: Option<String>,
    pub category_id: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
}
