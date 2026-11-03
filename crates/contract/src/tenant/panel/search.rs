//! search resource DTOs, ported from the Bun panel contract.
//!
//! One coalesced read behind the dashboard palette. Pages are not results: the
//! nav list lives in the web app, so the palette merges them client-side. There
//! is no per-group total either; a group that reaches the server's per-group
//! limit is the one the palette links to "Ver todos".

use crate::ErrorCode;

/// Shortest query the palette runs, after trimming.
pub const QUERY_MIN: usize = 2;

/// Longest query the palette runs, after trimming.
pub const QUERY_MAX: usize = 80;

/// Entities the palette searches. There is no page kind on purpose.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum PanelSearchKind {
    Product,
    Coupon,
    Customer,
    Tag,
    Category,
    Department,
    Badge,
    Subcategory,
}

/// One palette row. `status` stays free text (`active`, `disabled`, `expired`,
/// `available`, `unavailable`); the labels stay in the UI.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelSearchItem {
    pub kind: PanelSearchKind,
    pub id: String,
    pub label: String,
    /// A coupon's description, a customer's e-mail, …
    pub sublabel: Option<String>,
    pub status: Option<String>,
    /// App-relative, resolved per kind from the store's slug.
    pub href: String,
}

/// The rows of one kind, already ranked and capped.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelSearchGroup {
    pub kind: PanelSearchKind,
    pub items: Vec<PanelSearchItem>,
}

/// `{ canWrite, groups }`. `canWrite` only enables the palette's quick
/// actions; the write routes re-check the capability.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelSearchOutput {
    pub can_write: bool,
    pub groups: Vec<PanelSearchGroup>,
}

/// The palette query. `q` is required, so an absent one is a validation
/// failure rather than the extractor's own rejection.
#[derive(Debug, Clone, Default, serde::Deserialize)]
pub struct PanelSearchQuery {
    pub q: Option<String>,
}

impl PanelSearchQuery {
    /// `q`: 2..=80 characters after trimming.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        let term = self.term();

        if term.chars().count() < QUERY_MIN || term.chars().count() > QUERY_MAX {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }

    /// The trimmed term.
    pub fn term(&self) -> &str {
        self.q.as_deref().unwrap_or("").trim()
    }
}
