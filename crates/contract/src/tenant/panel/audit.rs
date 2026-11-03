//! audit resource DTOs, ported from the Bun panel contract.
//!
//! `action` stays free text on the wire too: MEN-74 owns the closed event
//! catalog, so a new event never breaks an older panel.

/// One line of the store's audit trail.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelAuditLog {
    pub id: String,
    pub action: String,
    pub actor: String,
    pub target: String,
    pub ip: String,
    /// RFC 3339 with milliseconds and a trailing `Z`.
    pub created_at: String,
}

/// `{ logs }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelAuditLogsOutput {
    pub logs: Vec<PanelAuditLog>,
}
