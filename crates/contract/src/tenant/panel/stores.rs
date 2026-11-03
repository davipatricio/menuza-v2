//! stores resource DTOs, ported from the Bun panel contract.
//!
//! `createStore` names no store: the store is what it creates. Every other
//! shape addresses the store by the slug the session already resolved, and the
//! slug itself is the public address, so it is never renamed here.

use crate::ErrorCode;

use crate::tenant::session::{SessionMember, TenantRole};

/// `v.strictObject({ displayName, slug })`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateStoreInput {
    pub display_name: String,
    pub slug: String,
}

impl CreateStoreInput {
    /// `displayName`: 2..=120 characters. `slug`:
    /// `^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$`, so three to twenty-four lowercase
    /// characters that neither start nor end with a hyphen.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if !(2..=120).contains(&self.display_name.chars().count()) {
            return Err(ErrorCode::ValidationFailed);
        }

        let slug = self.slug.as_bytes();
        let alphanumeric = |byte: u8| byte.is_ascii_lowercase() || byte.is_ascii_digit();

        let valid = (3..=24).contains(&slug.len())
            && alphanumeric(slug[0])
            && alphanumeric(slug[slug.len() - 1])
            && slug.iter().all(|byte| alphanumeric(*byte) || *byte == b'-');

        if valid {
            Ok(())
        } else {
            Err(ErrorCode::ValidationFailed)
        }
    }
}

/// The store plus the caller's membership on it, as the picker and the
/// dashboard header read them.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelStore {
    pub tenant_id: String,
    pub tenant_slug: String,
    pub tenant_name: String,
    pub role: TenantRole,
    pub member: SessionMember,
}
