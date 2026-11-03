//! integrations resource DTOs and the code catalog behind them.
//!
//! The catalog is code, exactly as in `@menuza/shared/tenant`: adding an
//! integration is an entry plus an implementation, never a migration. A store
//! has a `StoreIntegration` row only for integrations it has touched, so every
//! read here is "row or catalog default" — absence means `disabled` with the
//! catalog's own defaults, never an error.
//!
//! The config crosses as an open record so a new integration can add a setting
//! without a contract change; an unknown stored key is dropped and a missing one
//! takes the catalog default.

use std::collections::BTreeMap;

use crate::ErrorCode;

/// Longest integration id an input accepts.
pub const ID_MAX: usize = 64;

/// Longest config key a write accepts.
pub const CONFIG_KEY_MAX: usize = 64;

/// `enabled`, `disabled`, `paused` or `error`, the four stored states.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum IntegrationStatus {
    Enabled,
    Disabled,
    Paused,
    Error,
}

impl IntegrationStatus {
    /// The wire string, which is also the stored value.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Enabled => "enabled",
            Self::Disabled => "disabled",
            Self::Paused => "paused",
            Self::Error => "error",
        }
    }

    /// An unknown stored status reads as `disabled`: it must not read as "on".
    pub fn parse(raw: &str) -> Self {
        match raw {
            "enabled" => Self::Enabled,
            "paused" => Self::Paused,
            "error" => Self::Error,
            _ => Self::Disabled,
        }
    }
}

/// One setting value: the catalog defines text and switch settings only.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(untagged)]
pub enum IntegrationConfigValue {
    Text(String),
    Switch(bool),
}

impl IntegrationConfigValue {
    /// The value as serialized JSON keeps its type; a mixed record would need
    /// a stringly-typed blob instead.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Text(value) => Some(value),
            Self::Switch(_) => None,
        }
    }
}

/// The open record a store's config is: a string or a boolean per key.
pub type IntegrationConfig = BTreeMap<String, IntegrationConfigValue>;

/// A catalog default, before it becomes an owned config value.
pub enum ConfigDefault {
    Text(&'static str),
    Switch(bool),
}

impl ConfigDefault {
    fn value(&self) -> IntegrationConfigValue {
        match self {
            Self::Text(value) => IntegrationConfigValue::Text((*value).to_owned()),
            Self::Switch(value) => IntegrationConfigValue::Switch(*value),
        }
    }
}

/// One catalog entry: the stable id and the defaults its settings carry.
pub struct IntegrationDefinition {
    pub id: &'static str,
    /// `(key, default)`, in the order the detail page renders them.
    pub settings: &'static [(&'static str, ConfigDefault)],
}

/// Every integration the dashboard knows about, in catalog order.
pub const INTEGRATIONS: [IntegrationDefinition; 9] = [
    IntegrationDefinition {
        id: "google-analytics-4",
        settings: &[
            ("measurementId", ConfigDefault::Text("")),
            ("trackPurchases", ConfigDefault::Switch(true)),
        ],
    },
    IntegrationDefinition {
        id: "google-tag-manager",
        settings: &[("containerId", ConfigDefault::Text(""))],
    },
    IntegrationDefinition {
        id: "meta-pixel",
        settings: &[
            ("pixelId", ConfigDefault::Text("")),
            ("trackPurchases", ConfigDefault::Switch(true)),
        ],
    },
    IntegrationDefinition {
        id: "spoke",
        settings: &[
            ("apiKey", ConfigDefault::Text("")),
            ("syncCatalog", ConfigDefault::Switch(true)),
        ],
    },
    IntegrationDefinition {
        id: "mcp-dashboard",
        settings: &[
            ("allowDashboard", ConfigDefault::Switch(true)),
            ("allowStorefront", ConfigDefault::Switch(false)),
        ],
    },
    IntegrationDefinition {
        id: "mcp-storefront",
        settings: &[],
    },
    IntegrationDefinition {
        id: "pagarme",
        settings: &[("secretKey", ConfigDefault::Text(""))],
    },
    IntegrationDefinition {
        id: "lalamove",
        settings: &[
            ("apiKey", ConfigDefault::Text("")),
            ("serviceType", ConfigDefault::Text("MOTORCYCLE")),
        ],
    },
    IntegrationDefinition {
        id: "google-merchant-center",
        settings: &[("merchantId", ConfigDefault::Text(""))],
    },
];

/// The catalog entry behind an id, or `None` for an id the catalog dropped.
pub fn find_integration(id: &str) -> Option<&'static IntegrationDefinition> {
    INTEGRATIONS.iter().find(|integration| integration.id == id)
}

/// The catalog defaults for a store that has never saved this integration.
pub fn default_config(id: &str) -> IntegrationConfig {
    find_integration(id)
        .map(|integration| {
            integration
                .settings
                .iter()
                .map(|(key, default)| ((*key).to_owned(), default.value()))
                .collect()
        })
        .unwrap_or_default()
}

/// The stored blob as a config: unknown keys are ignored and missing ones take
/// the catalog default, so a row written by an older catalog still renders.
pub fn parse_config(id: &str, raw: Option<&str>) -> IntegrationConfig {
    let defaults = default_config(id);

    let Some(raw) = raw else {
        return defaults;
    };

    let Ok(serde_json::Value::Object(stored)) = serde_json::from_str(raw) else {
        return defaults;
    };

    let values = stored.into_iter().filter_map(|(key, value)| {
        let value = match value {
            serde_json::Value::String(text) => IntegrationConfigValue::Text(text),
            serde_json::Value::Bool(flag) => IntegrationConfigValue::Switch(flag),
            _ => return None,
        };

        Some((key, value))
    });

    defaults.into_iter().chain(values).collect()
}

/// The config as the text column stores it.
pub fn serialize_config(config: &IntegrationConfig) -> String {
    // A record of strings and booleans has no unrepresentable value.
    serde_json::to_string(config).unwrap_or_else(|_| "{}".to_owned())
}

/// One catalog integration's state for a store, with defaults filled in.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelIntegration {
    pub integration_id: String,
    pub status: IntegrationStatus,
    pub config: IntegrationConfig,
    pub enabled_at: Option<String>,
    pub updated_at: Option<String>,
}

/// `{ integrations }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelIntegrationsOutput {
    pub integrations: Vec<PanelIntegration>,
}

/// The body of the switch and the config save.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveIntegrationInput {
    pub integration_id: String,
    /// Absent keeps the stored status.
    pub status: Option<IntegrationStatus>,
    /// Absent keeps the stored config.
    pub config: Option<IntegrationConfig>,
}

impl SaveIntegrationInput {
    /// `integrationId`: 1..=64; config keys 1..=64 characters.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.integration_id.is_empty()
            || self.integration_id.chars().count() > ID_MAX
            || self.config.as_ref().is_some_and(|config| {
                config
                    .keys()
                    .any(|key| key.is_empty() || key.chars().count() > CONFIG_KEY_MAX)
            })
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ integration }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelIntegrationOutput {
    pub integration: PanelIntegration,
}

/// One connected MCP client. Never carries the token, only its identification.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelMcpSession {
    pub id: String,
    pub label: String,
    pub client_name: String,
    pub member_name: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

/// `{ sessions }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelMcpSessionsOutput {
    pub sessions: Vec<PanelMcpSession>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelMcpRevokeOutput {
    pub success: bool,
}
