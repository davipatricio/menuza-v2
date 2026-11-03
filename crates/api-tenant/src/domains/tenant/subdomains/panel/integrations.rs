//! integrations resource: panel routes.
//!
//! The catalog is code (`contract::tenant::panel::integrations`) and
//! `StoreIntegration` holds only per-store state, so a store that never touched
//! an integration reads as `disabled` with the catalog defaults — absence is
//! never an error and a new integration needs no backfill.
//!
//! Disabling an integration does **not** revoke its MCP sessions: revocation is
//! explicit from the sessions list, so flipping a switch cannot silently break
//! a colleague's connected client.

use std::collections::HashMap;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::integrations::{
    INTEGRATIONS, IntegrationStatus, PanelIntegration, PanelIntegrationOutput,
    PanelIntegrationsOutput, PanelMcpRevokeOutput, PanelMcpSession, PanelMcpSessionsOutput,
    SaveIntegrationInput, find_integration, parse_config, serialize_config,
};
use persistence::tenant::panel::integrations::{
    McpSessionRow, StoreIntegrationRow, mcp_session_find, mcp_session_list, mcp_session_revoke,
    store_integration_create, store_integration_find, store_integration_list,
    store_integration_update,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/integrations",
            axum::routing::get(list_integrations),
        )
        .route(
            "/panel/stores/{storeSlug}/integrations/{integrationId}",
            axum::routing::post(save_integration),
        )
        .route(
            "/panel/stores/{storeSlug}/integrations/mcp-dashboard/sessions",
            axum::routing::get(list_mcp_sessions),
        )
        .route(
            "/panel/stores/{storeSlug}/integrations/mcp-dashboard/sessions/{sessionId}/revoke",
            axum::routing::post(revoke_mcp_session),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            list_integrations,
            save_integration,
            list_mcp_sessions,
            revoke_mcp_session
        ),
        components(schemas(
            contract::tenant::panel::integrations::IntegrationConfigValue,
            contract::tenant::panel::integrations::IntegrationStatus,
            contract::tenant::panel::integrations::PanelIntegration,
            contract::tenant::panel::integrations::PanelIntegrationOutput,
            contract::tenant::panel::integrations::PanelIntegrationsOutput,
            contract::tenant::panel::integrations::PanelMcpRevokeOutput,
            contract::tenant::panel::integrations::PanelMcpSession,
            contract::tenant::panel::integrations::PanelMcpSessionsOutput,
            contract::tenant::panel::integrations::SaveIntegrationInput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// Every catalog integration with this store's state.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/integrations",
    operation_id = "listPanelIntegrations",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelIntegrationsOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_integrations(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelIntegrationsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = store_integration_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let by_id: HashMap<&str, &StoreIntegrationRow> = rows
        .iter()
        .map(|row| (row.integration_id.as_str(), row))
        .collect();

    Ok(Json(PanelIntegrationsOutput {
        integrations: INTEGRATIONS
            .iter()
            .map(|definition| panel_integration(definition.id, by_id.get(definition.id).copied()))
            .collect(),
    }))
}

/// Turns an integration on or off, or writes its config.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/integrations/{integrationId}",
    operation_id = "savePanelIntegration",
    tag = "panel",
    request_body = SaveIntegrationInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("integrationId" = String, Path, description = "The catalog integration to save.")
    ),
    responses(
        (status = 200, body = PanelIntegrationOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn save_integration(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, integration_id)): Path<(String, String)>,
    Json(input): Json<SaveIntegrationInput>,
) -> Result<Json<PanelIntegrationOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    input.validate().map_err(ApiError)?;

    if input.integration_id != integration_id || find_integration(&integration_id).is_none() {
        return Err(ApiError(ErrorCode::NotFound));
    }

    let existing = store_integration_find(&state.pool, &ctx.tenant, &integration_id)
        .await
        .map_err(db_error)?;

    let config = input.config.unwrap_or_else(|| {
        parse_config(
            &integration_id,
            existing.as_ref().and_then(|row| row.config.as_deref()),
        )
    });

    let stored_status = existing
        .as_ref()
        .map_or_else(|| "disabled".to_owned(), |row| row.status.clone());

    let status = input.status.map_or_else(
        || stored_status.clone(),
        |status| status.as_str().to_owned(),
    );

    let stamp = now();

    // `enabledAt` records the first enable and survives later saves; only a
    // transition into `enabled` from something else stamps it anew.
    let enabled_at = if status == IntegrationStatus::Enabled.as_str()
        && stored_status != IntegrationStatus::Enabled.as_str()
    {
        Some(stamp)
    } else {
        existing.as_ref().and_then(|row| row.enabled_at)
    };

    let config = serialize_config(&config);

    if existing.is_none() {
        store_integration_create(
            &state.pool,
            &ctx.tenant,
            &integration_id,
            &status,
            &config,
            enabled_at,
            stamp,
        )
        .await
        .map_err(db_error)?;
    } else if !store_integration_update(
        &state.pool,
        &ctx.tenant,
        &integration_id,
        &status,
        &config,
        enabled_at,
        stamp,
    )
    .await
    .map_err(db_error)?
    {
        return Err(ApiError(ErrorCode::Internal));
    }

    let row = store_integration_find(&state.pool, &ctx.tenant, &integration_id)
        .await
        .map_err(db_error)?;

    Ok(Json(PanelIntegrationOutput {
        integration: panel_integration(&integration_id, row.as_ref()),
    }))
}

/// Who is connected to this store's dashboard MCP right now.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/integrations/mcp-dashboard/sessions",
    operation_id = "listPanelMcpSessions",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelMcpSessionsOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_mcp_sessions(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelMcpSessionsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    let rows = mcp_session_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    Ok(Json(PanelMcpSessionsOutput {
        sessions: rows.iter().map(panel_mcp_session).collect(),
    }))
}

/// Revokes one connected MCP session and the token it uses.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/integrations/mcp-dashboard/sessions/{sessionId}/revoke",
    operation_id = "revokePanelMcpSession",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("sessionId" = String, Path, description = "The MCP session to revoke.")
    ),
    responses(
        (status = 200, body = PanelMcpRevokeOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn revoke_mcp_session(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, session_id)): Path<(String, String)>,
) -> Result<Json<PanelMcpRevokeOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "catalog:write")?;

    let Some(target) = mcp_session_find(&state.pool, &ctx.tenant, &session_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError::not_found());
    };

    if !mcp_session_revoke(
        &state.pool,
        &ctx.tenant,
        &target.id,
        &target.oauth_token_id,
        now(),
    )
    .await
    .map_err(db_error)?
    {
        return Err(ApiError::not_found());
    }

    Ok(Json(PanelMcpRevokeOutput { success: true }))
}

/// One catalog integration's state, defaults filled in for a missing row.
fn panel_integration(id: &str, row: Option<&StoreIntegrationRow>) -> PanelIntegration {
    PanelIntegration {
        integration_id: id.to_owned(),
        status: row.map_or(IntegrationStatus::Disabled, |row| {
            IntegrationStatus::parse(&row.status)
        }),
        config: parse_config(id, row.and_then(|row| row.config.as_deref())),
        enabled_at: row.and_then(|row| row.enabled_at).map(iso),
        updated_at: row.map(|row| iso(row.updated_at)),
    }
}

/// The joined session row as the list renders it; the token never travels.
fn panel_mcp_session(row: &McpSessionRow) -> PanelMcpSession {
    PanelMcpSession {
        id: row.id.clone(),
        label: row.label.clone(),
        client_name: row.client_name.clone(),
        member_name: row.member_name.clone(),
        created_at: iso(row.created_at),
        last_used_at: row.last_used_at.map(iso),
    }
}
