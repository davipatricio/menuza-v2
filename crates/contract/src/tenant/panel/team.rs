//! team resource DTOs, ported from the Bun panel contract.
//!
//! Read-only (MEN-225): the store's team comes from the seed, because inviting
//! a member needs email delivery, which is its own ticket.

use crate::tenant::session::{MemberKind, TenantRole};

/// One member of the store, with the role the capability map reads.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelTeamMember {
    pub member_id: String,
    pub name: Option<String>,
    pub email: String,
    pub kind: MemberKind,
    pub role: TenantRole,
    /// RFC 3339 with milliseconds and a trailing `Z`.
    pub joined_at: String,
}

/// `{ members }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelTeamMembersOutput {
    pub members: Vec<PanelTeamMember>,
}
