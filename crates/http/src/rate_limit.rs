//! Fixed-window, in-memory rate limiting for credential-probing endpoints.
//!
//! One bucket per client IP (resolved from the socket peer, or the rightmost
//! `x-forwarded-for` hop inside `TRUSTED_PROXY_HOPS` when the socket peer is a
//! trusted proxy). Bounded in size so a flood of unique addresses evicts idle
//! buckets instead of growing unbounded.
//!
//! ponytail: process-local fixed window; move to Redis or Postgres advisory
//! counters when running multiple `api-tenant` replicas behind a load balancer.

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use axum::http::HeaderMap;

use crate::Config;
use crate::extract::peer_is_trusted;

/// Maximum tracked IP buckets before expired/oldest entries are evicted.
const MAX_BUCKETS: usize = 10_000;

#[derive(Clone, Copy)]
struct Bucket {
    count: u32,
    reset_at: Instant,
}

/// Thread-safe fixed-window rate limiter keyed by client IP.
#[derive(Clone)]
pub struct RateLimiter {
    max_requests: u32,
    window: Duration,
    buckets: Arc<Mutex<HashMap<IpAddr, Bucket>>>,
}

impl RateLimiter {
    /// Allows at most `max_requests` per `window` for any single `IpAddr`.
    pub fn new(max_requests: u32, window: Duration) -> Self {
        Self {
            max_requests: max_requests.max(1),
            window,
            buckets: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Default auth limiter: 10 attempts per 60 seconds per client IP.
    pub fn auth_default() -> Self {
        Self::new(10, Duration::from_secs(60))
    }

    /// Records one attempt for `ip` at `now` and returns whether it is allowed.
    pub fn check_at(&self, ip: IpAddr, now: Instant) -> bool {
        let Ok(mut map) = self.buckets.lock() else {
            // A poisoned mutex still serves traffic rather than taking down auth.
            return true;
        };

        if let Some(bucket) = map.get_mut(&ip) {
            if now >= bucket.reset_at {
                bucket.count = 1;
                bucket.reset_at = now + self.window;
                return true;
            }

            if bucket.count >= self.max_requests {
                return false;
            }

            bucket.count += 1;
            return true;
        }

        if map.len() >= MAX_BUCKETS {
            map.retain(|_, bucket| now < bucket.reset_at);

            if map.len() >= MAX_BUCKETS
                && let Some(oldest_ip) = map
                    .iter()
                    .min_by_key(|(_, bucket)| bucket.reset_at)
                    .map(|(key, _)| *key)
            {
                map.remove(&oldest_ip);
            }
        }

        map.insert(
            ip,
            Bucket {
                count: 1,
                reset_at: now + self.window,
            },
        );

        true
    }

    /// Records one attempt for the request's client IP and returns whether it is allowed.
    pub fn check_request(
        &self,
        peer: Option<SocketAddr>,
        headers: &HeaderMap,
        config: &Config,
    ) -> bool {
        let ip = client_ip(peer, headers, config);
        self.check_at(ip, Instant::now())
    }
}

/// Resolves the caller's IP: trusts `x-forwarded-for` only when `peer` is a
/// trusted hop (`peer_is_trusted`), picking the hop `trusted_proxy_hops` from
/// the right (or the rightmost valid IP when `trusted_proxy_hops == 0` over
/// loopback). Falls back to the socket peer IP, or `0.0.0.0` in unit tests
/// without `ConnectInfo`.
pub fn client_ip(peer: Option<SocketAddr>, headers: &HeaderMap, config: &Config) -> IpAddr {
    let forwarded_host = headers
        .get("x-forwarded-host")
        .and_then(|value| value.to_str().ok());

    let trusted = peer_is_trusted(
        peer,
        &config.trusted_proxy_ips,
        config.trusted_proxy_hops,
        forwarded_host,
    );

    if trusted
        && let Some(xff) = headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
    {
        let hops: Vec<IpAddr> = xff
            .split(',')
            .filter_map(|part| part.trim().parse::<IpAddr>().ok())
            .collect();

        if !hops.is_empty() {
            let skip_from_right = usize::try_from(config.trusted_proxy_hops)
                .unwrap_or(1)
                .max(1);
            let idx = hops.len().saturating_sub(skip_from_right);
            return hops[idx];
        }
    }

    peer.map(|addr| addr.ip())
        .unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED))
}

#[cfg(test)]
mod tests {
    use std::net::{IpAddr, SocketAddr};
    use std::time::{Duration, Instant};

    use axum::http::{HeaderMap, HeaderValue};

    use super::{RateLimiter, client_ip};
    use crate::{Config, Env};

    fn test_config(hops: u32, ips: Vec<IpAddr>) -> Config {
        Config {
            env: Env::Production,
            host: "127.0.0.1".into(),
            port: 3002,
            database_url: "postgres://x/y".into(),
            database_pool_max: 1,
            trusted_proxy_hops: hops,
            trusted_proxy_ips: ips,
            internal_api_secret: None,
            vapid_public_key: None,
            mcp_allowed_hosts: vec!["localhost".into()],
        }
    }

    #[test]
    fn limiter_blocks_after_budget_and_resets_after_window() {
        let limiter = RateLimiter::new(2, Duration::from_secs(60));
        let ip: IpAddr = "203.0.113.9".parse().expect("ip");
        let t0 = Instant::now();

        assert!(limiter.check_at(ip, t0));
        assert!(limiter.check_at(ip, t0 + Duration::from_secs(1)));
        assert!(!limiter.check_at(ip, t0 + Duration::from_secs(2)));
        assert!(limiter.check_at(ip, t0 + Duration::from_secs(60)));
    }

    #[test]
    fn client_ip_ignores_xff_from_untrusted_peer() {
        let peer: SocketAddr = "198.51.100.7:54321".parse().expect("peer");
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("1.2.3.4"));
        headers.insert("x-forwarded-host", HeaderValue::from_static("menuza.com"));

        let config = test_config(1, vec!["10.0.0.1".parse().expect("proxy ip")]);
        assert_eq!(
            client_ip(Some(peer), &headers, &config),
            "198.51.100.7".parse::<IpAddr>().expect("ip")
        );
    }

    #[test]
    fn client_ip_picks_rightmost_trusted_hop_when_peer_is_trusted() {
        let peer: SocketAddr = "10.0.0.1:443".parse().expect("peer");
        let mut headers = HeaderMap::new();
        // Attacker prepends 1.1.1.1; trusted proxy appends real client 203.0.113.42.
        headers.insert(
            "x-forwarded-for",
            HeaderValue::from_static("1.1.1.1, 203.0.113.42"),
        );
        headers.insert("x-forwarded-host", HeaderValue::from_static("menuza.com"));

        let config = test_config(1, vec!["10.0.0.1".parse().expect("proxy ip")]);
        assert_eq!(
            client_ip(Some(peer), &headers, &config),
            "203.0.113.42".parse::<IpAddr>().expect("ip")
        );
    }
}
