//! The shared shell end to end: probes, layer order, config parsing.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use menuza_http::extract::TENANT_HEADER;
use menuza_http::{AppState, Config, ConfigError, Env, TenantScope};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

/// A pool that never dials: `connect_lazy` only builds the pool. The port is
/// closed, so readiness is exercised without infrastructure.
#[derive(Clone)]
struct TestState {
    pool: sqlx::PgPool,
    config: Config,
}

impl AppState for TestState {
    fn pool(&self) -> &sqlx::PgPool {
        &self.pool
    }

    fn config(&self) -> &Config {
        &self.config
    }
}

fn state() -> TestState {
    let config = Config {
        env: Env::Development,
        host: "127.0.0.1".into(),
        port: 0,
        database_url: "postgres://menuza:menuza@127.0.0.1:1/none".into(),
        database_pool_max: 1,
        trusted_proxy_hops: 0,
        trusted_proxy_ips: Vec::new(),
        internal_api_secret: None,
        vapid_public_key: None,
        mcp_allowed_hosts: vec!["localhost".into(), "127.0.0.1".into(), "::1".into()],
    };

    // Mirrors the pool `connect` builds: the acquire timeout is what turns a
    // refused dial into a fast error instead of sqlx's default 30s retry.
    let pool = PgPoolOptions::new()
        .acquire_timeout(Duration::from_secs(2))
        .connect_lazy(&config.database_url)
        .expect("lazy pool");

    TestState { pool, config }
}

fn app(state: &TestState) -> Router {
    let routes: Router<TestState> = Router::new();
    menuza_http::router(state, routes).with_state(state.clone())
}

fn get(uri: &str) -> Request<Body> {
    Request::get(uri).body(Body::empty()).expect("request")
}

#[tokio::test]
async fn shell_livez_is_ok() {
    let response = app(&state()).oneshot(get("/livez")).await.expect("livez");

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 1024)
        .await
        .expect("body");
    assert_eq!(&body[..], b"ok");
}

#[tokio::test]
async fn shell_request_id_is_propagated() {
    let mut request = get("/livez");
    request
        .headers_mut()
        .insert("x-request-id", "abc".parse().expect("header"));

    let response = app(&state()).oneshot(request).await.expect("livez");
    assert_eq!(response.headers().get("x-request-id").unwrap(), "abc");

    let response = app(&state()).oneshot(get("/livez")).await.expect("livez");
    let minted = response
        .headers()
        .get("x-request-id")
        .expect("minted request id");
    assert!(!minted.is_empty());
}

#[tokio::test]
async fn shell_unknown_path_is_404() {
    let response = app(&state()).oneshot(get("/nope")).await.expect("404");

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn shell_readyz_is_503_without_a_database() {
    // A lazy pool dials on first checkout and nothing listens on port 1, so
    // this is a fast failure. The timeout only guards a hung dial.
    let response = tokio::time::timeout(
        Duration::from_secs(10),
        app(&state()).oneshot(get("/readyz")),
    )
    .await
    .expect("readyz timed out")
    .expect("readyz");

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn shell_body_limit_rejects_oversized_payload() {
    let mut request = Request::post("/livez")
        .body(Body::from(vec![0u8; 1024 * 1024 + 1]))
        .expect("request");
    request
        .headers_mut()
        .insert("content-length", (1024 * 1024 + 1).into());

    let response = app(&state()).oneshot(request).await.expect("body limit");

    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

/// Reports the peer it was handed and the scope that peer proved: a claim from
/// an untrusted hop never reaches this, the extractor rejects it first.
async fn peer_scope(ConnectInfo(peer): ConnectInfo<SocketAddr>, scope: TenantScope) -> String {
    match scope.tenant_id() {
        Some(tenant) => format!("{peer} {tenant}"),
        None => format!("{peer} none"),
    }
}

#[tokio::test]
async fn shell_connect_info_is_the_loopback_peer() {
    let state = state();
    let routes: Router<TestState> = Router::new().route("/peer", axum::routing::get(peer_scope));

    let make = menuza_http::router(&state, routes)
        .with_state(state.clone())
        .into_make_service_with_connect_info::<SocketAddr>();
    let mut request = get("/peer");
    request
        .headers_mut()
        .insert(TENANT_HEADER, "t1".parse().expect("header"));

    let service = make
        .oneshot(
            "127.0.0.1:54321"
                .parse::<std::net::SocketAddr>()
                .expect("peer"),
        )
        .await
        .expect("make service");
    let response = service.oneshot(request).await.expect("peer");

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 1024)
        .await
        .expect("body");
    assert_eq!(&body[..], b"127.0.0.1:54321 t1");
}

#[tokio::test]
async fn shell_connect_info_public_peer_is_not_a_trusted_hop() {
    let state = state();
    let routes: Router<TestState> = Router::new().route("/peer", axum::routing::get(peer_scope));

    let make = menuza_http::router(&state, routes)
        .with_state(state.clone())
        .into_make_service_with_connect_info::<SocketAddr>();
    let peer: SocketAddr = "203.0.113.9:40000".parse().expect("peer");

    // No claim: the handler still sees the peer it was handed.
    let service = make.clone().oneshot(peer).await.expect("make service");
    let response = service.oneshot(get("/peer")).await.expect("peer");

    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 1024)
        .await
        .expect("body");
    assert_eq!(&body[..], b"203.0.113.9:40000 none");

    // A claim from that peer is refused: a public address is no trusted hop.
    let mut request = get("/peer");
    request
        .headers_mut()
        .insert(TENANT_HEADER, "t1".parse().expect("header"));
    let service = make.oneshot(peer).await.expect("make service");
    let response = service.oneshot(request).await.expect("peer");

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
        .collect()
}

#[test]
fn shell_config_defaults() {
    let config =
        Config::from_map(&map(&[("DATABASE_URL", "postgres://x/y")]), 3001).expect("config");

    assert_eq!(config.host, "127.0.0.1");
    assert_eq!(config.port, 3001);
    assert_eq!(config.database_pool_max, 10);
    assert_eq!(config.trusted_proxy_hops, 0);
    assert!(config.trusted_proxy_ips.is_empty());
    assert_eq!(config.internal_api_secret, None);
    assert_eq!(config.env, Env::Development);
    assert_eq!(
        config.mcp_allowed_hosts,
        vec!["localhost", "127.0.0.1", "::1"]
    );
}

#[test]
fn shell_config_reads_mcp_allowed_hosts() {
    let config = Config::from_map(
        &map(&[
            ("DATABASE_URL", "postgres://x/y"),
            (
                "MCP_ALLOWED_HOSTS",
                " api.menuza.dev , api.menuza.dev:8443 ",
            ),
        ]),
        3002,
    )
    .expect("config");

    assert_eq!(
        config.mcp_allowed_hosts,
        vec!["api.menuza.dev", "api.menuza.dev:8443"]
    );

    // A blank or separator-only value is the loopback default, never an empty
    // allowlist the transport would read as "any host".
    for raw in ["", " , "] {
        let blank = Config::from_map(
            &map(&[
                ("DATABASE_URL", "postgres://x/y"),
                ("MCP_ALLOWED_HOSTS", raw),
            ]),
            3002,
        )
        .expect("config");

        assert_eq!(
            blank.mcp_allowed_hosts,
            vec!["localhost", "127.0.0.1", "::1"]
        );
    }
}

#[test]
fn shell_config_reads_trusted_proxy_ips_and_secret() {
    let config = Config::from_map(
        &map(&[
            ("DATABASE_URL", "postgres://x/y"),
            ("TRUSTED_PROXY_HOP_IPS", " 10.0.0.5 , 127.0.0.1 "),
            ("INTERNAL_API_SECRET", "s3cret"),
        ]),
        3001,
    )
    .expect("config");

    assert_eq!(
        config.trusted_proxy_ips,
        vec![
            "10.0.0.5".parse::<std::net::IpAddr>().unwrap(),
            "127.0.0.1".parse::<std::net::IpAddr>().unwrap()
        ]
    );
    assert_eq!(config.internal_api_secret.as_deref(), Some("s3cret"));

    let blank = Config::from_map(
        &map(&[
            ("DATABASE_URL", "postgres://x/y"),
            ("TRUSTED_PROXY_HOP_IPS", ""),
            ("INTERNAL_API_SECRET", ""),
        ]),
        3001,
    )
    .expect("config");

    assert!(blank.trusted_proxy_ips.is_empty());
    assert_eq!(blank.internal_api_secret, None);
}

#[test]
fn shell_config_rejects_an_unparsable_proxy_ip() {
    let bad = map(&[
        ("DATABASE_URL", "postgres://x/y"),
        ("TRUSTED_PROXY_HOP_IPS", "10.0.0.5,nope"),
    ]);

    assert!(matches!(
        Config::from_map(&bad, 3001),
        Err(ConfigError::Invalid("TRUSTED_PROXY_HOP_IPS"))
    ));
}

#[test]
fn shell_config_rejects_missing_database_url() {
    assert!(matches!(
        Config::from_map(&HashMap::new(), 3001),
        Err(ConfigError::Missing("DATABASE_URL"))
    ));

    let zero_pool = map(&[
        ("DATABASE_URL", "postgres://x/y"),
        ("DATABASE_POOL_MAX", "0"),
    ]);
    assert!(matches!(
        Config::from_map(&zero_pool, 3001),
        Err(ConfigError::Invalid("DATABASE_POOL_MAX"))
    ));
}
