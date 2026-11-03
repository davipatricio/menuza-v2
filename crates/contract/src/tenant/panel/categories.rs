//! categories resource DTOs, ported from the Bun panel contract.
//!
//! A category carries its name, order and active flag plus the departments it
//! appears under. Its item count walks the subcategories, because that is the
//! level products attach to.

use crate::ErrorCode;

/// Longest taxonomy name, counted after trimming.
pub const NAME_MAX: usize = 80;

/// Longest id a taxonomy input accepts.
pub const ID_MAX: usize = 64;

/// `{ name, sortOrder, active, departmentIds }`, for create and update alike:
/// the update replaces every field.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CategoryInput {
    pub name: String,
    pub sort_order: i32,
    pub active: bool,
    pub department_ids: Vec<String>,
}

impl CategoryInput {
    /// `name`: 1..=80 characters after trimming; `sortOrder`: 0 or more;
    /// `departmentIds`: every id 1..=64 characters.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.name.trim().is_empty()
            || self.name.trim().chars().count() > NAME_MAX
            || self.sort_order < 0
        {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .department_ids
            .iter()
            .any(|id| id.is_empty() || id.chars().count() > ID_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ id, name, active, sortOrder, itemsCount, updatedAt, departmentIds,
/// departmentNames }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCategory {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub sort_order: i32,
    pub items_count: i64,
    pub updated_at: String,
    pub department_ids: Vec<String>,
    pub department_names: Vec<String>,
}

/// `{ categories }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCategoriesOutput {
    pub categories: Vec<PanelCategory>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCategorySuccess {
    pub success: bool,
}

/// The filters the category screen writes to the URL. Every key is optional,
/// so a bare `{ storeSlug }` caller still reads the full list.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCategoriesQuery {
    pub q: Option<String>,
    pub status: Option<String>,
    pub department_id: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
}
