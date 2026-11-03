//! customers resource DTOs, ported from the Bun panel contract.
//!
//! A customer belongs to a store and the panel derives their order count and
//! total spent from that store's orders on every read. Nothing is stored, so the
//! table and the detail page cannot disagree with the order list.

use crate::tenant::panel::orders::PanelOrder;

/// A customer plus the totals derived from their orders in this store.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCustomer {
    pub id: String,
    pub name: String,
    pub email: String,
    pub phone: String,
    pub orders_count: i64,
    pub total_spent_cents: i64,
}

/// `{ customers }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCustomersOutput {
    pub customers: Vec<PanelCustomer>,
}

/// `{ customer, orders }`: the same row the list carries, plus their orders
/// newest first.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelCustomerOutput {
    pub customer: PanelCustomer,
    pub orders: Vec<PanelOrder>,
}
