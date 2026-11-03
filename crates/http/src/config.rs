//! Process configuration for both APIs.
//!
//! Values are read once at boot: `from_env` snapshots the process environment
//! and hands the result to `from_map`, which is what the tests drive. An empty
//! value counts as absent for every key, so a blank line in `.env` never beats a
//! default. Nothing here logs a value: `DATABASE_URL` carries the password.

use std::collections::HashMap;
use std::net::IpAddr;

/// Runtime profile. `production` switches logging to JSON.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Development,
    Production,
}

impl Env {
    /// Returns `true` in development.
    pub fn is_development(self) -> bool {
        matches!(self, Self::Development)
    }

    /// Only the exact word `production`, in any case, selects production.
    pub fn parse(raw: &str) -> Self {
        if raw.eq_ignore_ascii_case("production") {
            Self::Production
        } else {
            Self::Development
        }
    }
}

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_DATABASE_POOL_MAX: u32 = 10;
/// `Host` authorities the MCP endpoint answers. Loopback only: a public
/// deployment names its own hosts, and there is no wildcard.
const DEFAULT_MCP_ALLOWED_HOSTS: [&str; 3] = ["localhost", "127.0.0.1", "::1"];

/// Everything a binary needs to start. Ports are the contract values 3001
/// (commerce) and 3002 (tenant), so the caller passes the port in.
#[derive(Debug, Clone)]
pub struct Config {
    pub env: Env,
    /// `HOST`, default `127.0.0.1`.
    pub host: String,
    /// Caller-supplied: 3001 commerce, 3002 tenant.
    pub port: u16,
    /// `DATABASE_URL`, required.
    pub database_url: String,
    /// `DATABASE_POOL_MAX`, default 10, at least 1.
    pub database_pool_max: u32,
    /// `TRUSTED_PROXY_HOPS`, default 0.
    pub trusted_proxy_hops: u32,
    /// `TRUSTED_PROXY_HOP_IPS`, comma-separated, default empty.
    pub trusted_proxy_ips: Vec<IpAddr>,
    /// `INTERNAL_API_SECRET`; empty means no internal caller is accepted.
    pub internal_api_secret: Option<String>,
    /// `VAPID_PUBLIC_KEY`; empty disables push, and the public key route
    /// answers `INTERNAL` rather than serving a blank key.
    pub vapid_public_key: Option<String>,
    /// `MCP_ALLOWED_HOSTS`, comma-separated `host` or `host:port` authorities
    /// the `/mcp` endpoint accepts, default loopback. Never an empty list: the
    /// MCP transport reads an empty allowlist as "any host".
    pub mcp_allowed_hosts: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("{0} is required")]
    Missing(&'static str),
    #[error("{0} must be a positive integer")]
    Invalid(&'static str),
}

impl Config {
    /// Reads the process environment exactly once and delegates to [`Config::from_map`].
    pub fn from_env(port: u16) -> Result<Self, ConfigError> {
        let map: HashMap<String, String> = std::env::vars().collect();
        Self::from_map(&map, port)
    }

    /// Builds a config from any map. Unit-testable, and the only place keys are read.
    pub fn from_map(map: &HashMap<String, String>, port: u16) -> Result<Self, ConfigError> {
        let database_url = read(map, "DATABASE_URL")
            .ok_or(ConfigError::Missing("DATABASE_URL"))?
            .to_owned();
        let database_pool_max = number(map, "DATABASE_POOL_MAX", DEFAULT_DATABASE_POOL_MAX)?;

        if database_pool_max == 0 {
            return Err(ConfigError::Invalid("DATABASE_POOL_MAX"));
        }

        Ok(Self {
            env: Env::parse(read(map, "MENUZA_ENV").unwrap_or_default()),
            host: read(map, "HOST").unwrap_or(DEFAULT_HOST).to_owned(),
            port,
            database_url,
            database_pool_max,
            trusted_proxy_hops: number(map, "TRUSTED_PROXY_HOPS", 0)?,
            trusted_proxy_ips: ip_list(map, "TRUSTED_PROXY_HOP_IPS")?,
            internal_api_secret: read(map, "INTERNAL_API_SECRET").map(str::to_owned),
            vapid_public_key: read(map, "VAPID_PUBLIC_KEY").map(str::to_owned),
            mcp_allowed_hosts: host_list(map, "MCP_ALLOWED_HOSTS"),
        })
    }
}

/// Absent and empty are the same thing: neither is a value.
fn read<'a>(map: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    map.get(key)
        .map(String::as_str)
        .filter(|raw| !raw.is_empty())
}

fn number(
    map: &HashMap<String, String>,
    key: &'static str,
    default: u32,
) -> Result<u32, ConfigError> {
    match read(map, key) {
        Some(raw) => raw.trim().parse().map_err(|_| ConfigError::Invalid(key)),
        None => Ok(default),
    }
}

/// Comma-separated addresses. Absent or empty is an empty list, never a wildcard.
fn ip_list(map: &HashMap<String, String>, key: &'static str) -> Result<Vec<IpAddr>, ConfigError> {
    match read(map, key) {
        Some(raw) => raw
            .split(',')
            .map(|entry| entry.trim().parse().map_err(|_| ConfigError::Invalid(key)))
            .collect(),
        None => Ok(Vec::new()),
    }
}

/// Comma-separated host authorities. Absent, empty, or only separators is the
/// loopback default: an empty allowlist would accept every `Host`.
fn host_list(map: &HashMap<String, String>, key: &str) -> Vec<String> {
    let hosts: Vec<String> = read(map, key)
        .map(|raw| {
            raw.split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();

    if hosts.is_empty() {
        return DEFAULT_MCP_ALLOWED_HOSTS
            .iter()
            .map(|h| (*h).to_owned())
            .collect();
    }

    hosts
}
