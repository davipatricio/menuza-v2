//! Commerce API binary, `:3001`.

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = menuza_http::Config::from_env(3001)?;
    menuza_http::init_tracing(config.env);

    let pool = menuza_http::connect(&config).await?;

    // Insert-only: no workers, no queues, no maintenance loop. Jobs are rows in
    // the pool the handlers already write through (ADR-0008).
    let river = riverqueue::Client::builder(pool.clone()).build()?;

    let app = menuza_http::docs::mount(api_commerce::router(), api_commerce::openapi(), config.env);

    menuza_http::serve(
        api_commerce::State {
            pool,
            config,
            river,
        },
        app,
    )
    .await?;

    Ok(())
}
