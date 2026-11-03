//! kits resource DTOs, ported from the Bun panel contract.
//!
//! The panel only reads kits: they are assembled from variations elsewhere, so
//! this resource carries a list shape and nothing else.

/// `{ id, name, mode, available, itemsCount }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKit {
    pub id: String,
    pub name: String,
    pub mode: String,
    pub available: bool,
    pub items_count: i64,
}

/// `{ kits }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelKitsOutput {
    pub kits: Vec<PanelKit>,
}
