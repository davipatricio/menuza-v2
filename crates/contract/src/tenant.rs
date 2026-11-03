//! DTOs for the tenant API: health plus one module per subdomain.

pub mod account;
pub mod internal;
pub mod panel;
pub mod profile;
pub mod public;
pub mod push;
pub mod session;

use chrono::{SecondsFormat, Utc};

/// `{"status":"ok","service":"tenant","timestamp":"<ISO-8601 ms Z>"}`, exactly
/// the shape the retired endpoint returned.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct Health {
    pub status: HealthStatus,
    pub service: ServiceName,
    /// RFC 3339 with milliseconds and a trailing Z.
    pub timestamp: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Ok,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ServiceName {
    Tenant,
}

impl Health {
    pub fn new(service: ServiceName) -> Self {
        Self {
            status: HealthStatus::Ok,
            service,
            timestamp: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        }
    }
}
