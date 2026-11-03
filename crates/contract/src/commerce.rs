//! DTOs for the commerce API: health plus one module per subdomain.

pub mod orders;
pub mod payments;
pub mod public;
pub mod wallet;

use chrono::{SecondsFormat, Utc};

/// `{"status":"ok","service":"commerce","timestamp":"<ISO-8601 ms Z>"}`, exactly
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
    Commerce,
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
