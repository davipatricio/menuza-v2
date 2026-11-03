//! Tenant API binary, `:3002`. Panel, OAuth2 and MCP.

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = menuza_http::Config::from_env(3002)?;
    menuza_http::init_tracing(config.env);

    let pool = menuza_http::connect(&config).await?;

    let app = menuza_http::docs::mount(api_tenant::router(), api_tenant::openapi(), config.env);

    menuza_http::serve(api_tenant::State { pool, config }, app).await?;

    Ok(())
}
