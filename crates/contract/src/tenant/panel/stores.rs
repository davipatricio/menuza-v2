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

/// The store's palette as the settings screen and the public storefront read
/// it. `primaryForeground` is derived from `primaryColor`, never saved.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelTheme {
    pub primary_color: String,
    pub primary_foreground: String,
    pub accent_color: String,
    pub background_color: String,
    pub foreground_color: String,
    pub radius: i32,
}

/// `v.strictObject({ primaryColor, accentColor, backgroundColor, radius })`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveThemeInput {
    pub primary_color: String,
    pub accent_color: String,
    pub background_color: String,
    pub radius: i32,
}

impl SaveThemeInput {
    /// Every color is `#rrggbb` and the radius stays inside the range the
    /// check constraint accepts, so a bad save is a 400 before the SQL runs.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        let colors = [
            &self.primary_color,
            &self.accent_color,
            &self.background_color,
        ];

        let valid =
            colors.iter().all(|color| is_hex_color(color)) && (0..=32).contains(&self.radius);

        if valid {
            Ok(())
        } else {
            Err(ErrorCode::ValidationFailed)
        }
    }
}

/// `#rrggbb`, lowercase or uppercase, and nothing else. `domain::theme` owns the
/// same rule for the resolved palette; the contract layer validates before it
/// depends on any other crate.
fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();

    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}
