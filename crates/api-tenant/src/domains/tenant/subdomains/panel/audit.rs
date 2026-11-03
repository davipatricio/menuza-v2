//! audit resource: panel routes.
//!
//! The trail is append-only and `action` is free text on the wire too: MEN-74
//! owns the closed event catalog.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::tenant::panel::audit::{PanelAuditLog, PanelAuditLogsOutput};
use persistence::tenant::panel::audit::{AuditLogRow, audit_log_list};

use super::support::{context, guard, iso};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/panel/stores/{storeSlug}/audit-logs",
        axum::routing::get(list_audit_logs),
    )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(list_audit_logs),
        components(schemas(
            contract::tenant::panel::audit::PanelAuditLog,
            contract::tenant::panel::audit::PanelAuditLogsOutput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The store's audit trail, newest first.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/audit-logs",
    operation_id = "listPanelAuditLogs",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelAuditLogsOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_audit_logs(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelAuditLogsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let logs = audit_log_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?
        .into_iter()
        .map(panel_audit_log)
        .collect();

    Ok(Json(PanelAuditLogsOutput { logs }))
}

/// The row as the trail table reads it.
/// MCP reuses this: the tool maps the same audit rows.
pub(crate) fn panel_audit_log(row: AuditLogRow) -> PanelAuditLog {
    PanelAuditLog {
        id: row.id,
        action: row.action,
        actor: row.actor,
        target: row.target,
        ip: row.ip,
        created_at: iso(row.created_at),
    }
}
