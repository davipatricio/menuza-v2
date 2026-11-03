//! Worker binary: the three River consumers over the shared Postgres pool.
//!
//! Nothing listens (ADR-0008). The process opens a pool with the same settings
//! the APIs use, registers one worker per job kind, polls for work, and on
//! `SIGINT` or `SIGTERM` stops fetching, lets in-flight jobs finish, and closes
//! the pool.

mod orders_expiry;
mod payment_events;
mod push_dispatch;
mod push_sender;
mod queue;

use std::error::Error;

use riverqueue::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // No port: the worker serves nothing, so the contract port is unused.
    let config = menuza_http::Config::from_env(0)?;

    menuza_http::init_tracing(config.env);

    let pool = menuza_http::connect(&config).await?;

    let mut workers = riverqueue::Workers::new();

    orders_expiry::register(&mut workers, &pool)?;
    payment_events::register(&mut workers, &pool)?;
    push_dispatch::register(&mut workers, &pool)?;

    let mut builder = Client::builder(pool.clone())
        .workers(workers)
        .default_max_attempts(queue::MAX_ATTEMPTS)
        .soft_stop_timeout(queue::SOFT_STOP_TIMEOUT)
        // Polling only: a connection parked on LISTEN would be one the API pool
        // cannot use, and it would tie the worker to session pooling (ADR-0008).
        .without_notifications();

    for (name, queue_config) in queue::queues() {
        builder = builder.queue(name, queue_config);
    }

    let client = builder.build()?;

    tracing::info!("worker started");

    let mut run = client.start_with_graceful_stop(shutdown_signal())?;

    run.wait().await?;

    tracing::info!("worker stopped");

    pool.close().await;

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
