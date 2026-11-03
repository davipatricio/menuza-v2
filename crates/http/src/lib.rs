//! Shared tower layers and extractors, composed once and mounted by both binaries.

use std::net::SocketAddr;
use std::str::FromStr;
use std::time::Duration;

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use tracing_subscriber::EnvFilter;

pub mod config;
pub mod docs;
pub mod extract;
pub mod layers;
pub use config::{Config, ConfigError, Env};
pub use extract::{CommerceSession, InternalToken, SessionToken, TenantScope};

/// What both binaries must hand the shared router: a pool and a config.
pub trait AppState: Clone + Send + Sync + 'static {
    fn pool(&self) -> &sqlx::PgPool;
    fn config(&self) -> &Config;
}

/// Logs go to stdout: JSON in production, human-readable in development.
/// `RUST_LOG` wins when set. No configuration value is ever logged.
pub fn init_tracing(env: Env) {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,http=debug"));

    match env {
        Env::Production => {
            let _ = tracing_subscriber::fmt()
                .with_env_filter(filter)
                .json()
                .try_init();
        }
        Env::Development => {
            let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
        }
    }
}

/// Opens the pool with the timeouts both APIs run with. The statement cache is
/// capped because PgBouncer in transaction mode cannot handle unbounded
/// prepared statements.
pub async fn connect(config: &Config) -> Result<sqlx::PgPool, sqlx::Error> {
    let options = PgConnectOptions::from_str(&config.database_url)?.statement_cache_capacity(100);

    PgPoolOptions::new()
        .max_connections(config.database_pool_max)
        .acquire_timeout(Duration::from_secs(2))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1800))
        .connect_with(options)
        .await
}

/// Health probes plus the caller's routes, under the one layer stack.
pub fn router<S: AppState>(state: &S, routes: Router<S>) -> Router<S> {
    let health = Router::new()
        .route("/livez", get(livez))
        .route("/readyz", get(readyz::<S>));

    let merged = routes.merge(health);

    layers::apply(merged, state.config().env)
}

/// Liveness is process-only: a failing database must not restart the process.
async fn livez() -> (StatusCode, &'static str) {
    (StatusCode::OK, "ok")
}

/// Readiness touches the database, so a drained or unreachable pool leaves the
/// instance out of the load balancer without killing it.
async fn readyz<S: AppState>(State(state): State<S>) -> (StatusCode, &'static str) {
    match sqlx::query("SELECT 1").execute(state.pool()).await {
        Ok(_) => (StatusCode::OK, "ok"),
        Err(_) => (StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
    }
}

/// How long in-flight requests get after the signal before the process stops
/// waiting for them and closes the pool anyway.
const DRAIN_TIMEOUT: Duration = Duration::from_secs(15);

/// Binds, serves until a signal, then drains the pool.
pub async fn serve<S: AppState>(state: S, routes: Router<S>) -> std::io::Result<()> {
    let app = router(&state, routes).with_state(state.clone());

    let listener =
        tokio::net::TcpListener::bind((state.config().host.as_str(), state.config().port)).await?;
    tracing::info!(address = %listener.local_addr()?, "listening");

    // The peer is proved from the socket: extractors read it out of these
    // extensions, so it is never sourced from a header.
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let server = async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            let _ = stopped.await;
        })
        .await
    };
    tokio::pin!(server);

    let signal = async move {
        shutdown_signal().await;
        let _ = stop.send(());
    };
    tokio::pin!(signal);

    tokio::select! {
        served = &mut server => served?,
        () = &mut signal => {
            // The drain clock starts at the signal, not at boot: no request
            // may hold the process open past `DRAIN_TIMEOUT`.
            match tokio::time::timeout(DRAIN_TIMEOUT, &mut server).await {
                Ok(served) => served?,
                Err(_) => tracing::warn!(
                    seconds = DRAIN_TIMEOUT.as_secs(),
                    "in-flight requests outlived the drain window, closing anyway"
                ),
            }
        }
    }

    state.pool().close().await;

    Ok(())
}

/// SIGINT or SIGTERM, whichever arrives first.
async fn shutdown_signal() {
    let interrupt = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = interrupt => {}
        _ = terminate => {}
    }

    tracing::info!("shutting down");
}
