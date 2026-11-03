//! departments resource DTOs, ported from the Bun panel contract.
//!
//! A department groups categories and has no products of its own. Deactivating
//! one that still holds products needs a destination category, so the update
//! carries an optional move target.

use super::categories::{ID_MAX, NAME_MAX};
use crate::ErrorCode;

/// `{ name, active }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateDepartmentInput {
    pub name: String,
    pub active: bool,
}

impl CreateDepartmentInput {
    /// `name`: 1..=80 characters after trimming.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.name.trim().is_empty() || self.name.trim().chars().count() > NAME_MAX {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ name, active, moveProductsToCategoryId }`. The target moves the
/// department's products into that category's `Geral` subcategory when the
/// department is deactivated.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateDepartmentInput {
    pub name: String,
    pub active: bool,
    #[serde(default)]
    pub move_products_to_category_id: Option<String>,
}

impl UpdateDepartmentInput {
    /// The same name rule as create, plus a 1..=64 character target id when one
    /// was sent. `null` and an omitted key both mean "no target".
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.name.trim().is_empty() || self.name.trim().chars().count() > NAME_MAX {
            return Err(ErrorCode::ValidationFailed);
        }

        if self
            .move_products_to_category_id
            .as_ref()
            .is_some_and(|id| id.is_empty() || id.chars().count() > ID_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ id, name, active, itemsCount, updatedAt }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelDepartment {
    pub id: String,
    pub name: String,
    pub active: bool,
    pub items_count: i64,
    pub updated_at: String,
}

/// `{ departments }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelDepartmentsOutput {
    pub departments: Vec<PanelDepartment>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelDepartmentSuccess {
    pub success: bool,
}

/// The filters the department screen writes to the URL.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDepartmentsQuery {
    pub q: Option<String>,
    pub status: Option<String>,
    pub sort_by: Option<String>,
    pub order: Option<String>,
}
