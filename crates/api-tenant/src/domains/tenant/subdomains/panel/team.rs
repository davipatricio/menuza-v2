//! team resource: panel routes.
//!
//! Read-only (MEN-225): the store's team comes from the seed, because inviting a
//! member needs email delivery, which is its own ticket. Gated on `team:read`,
//! so a `staff` member is refused here while still reading orders.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::tenant::panel::team::{PanelTeamMember, PanelTeamMembersOutput};
use contract::tenant::session::{MemberKind, TenantRole};
use persistence::tenant::panel::team::{TeamMemberRow, team_list};

use super::support::{context, guard, iso};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new().route(
        "/panel/stores/{storeSlug}/team",
        axum::routing::get(list_team_members),
    )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(list_team_members),
        components(schemas(
            contract::tenant::panel::team::PanelTeamMember,
            contract::tenant::panel::team::PanelTeamMembersOutput,
            contract::tenant::session::MemberKind,
            contract::tenant::session::TenantRole
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The store's team, oldest membership first.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/team",
    operation_id = "listPanelTeamMembers",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelTeamMembersOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_team_members(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelTeamMembersOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "team:read")?;

    let rows = team_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let members = rows.into_iter().map(panel_member).collect();

    Ok(Json(PanelTeamMembersOutput { members }))
}

/// The joined row, with the stored role narrowed to what the map reads.
fn panel_member(row: TeamMemberRow) -> PanelTeamMember {
    PanelTeamMember {
        member_id: row.member_id,
        name: row.name,
        email: row.email,
        kind: if row.kind == "bot" {
            MemberKind::Bot
        } else {
            MemberKind::Human
        },
        // Roles are free-text columns; an unrecognized stored value is the
        // least-privileged known role rather than a hidden member.
        role: match row.role.as_str() {
            "owner" => TenantRole::Owner,
            "admin" => TenantRole::Admin,
            _ => TenantRole::Staff,
        },
        joined_at: iso(row.joined_at),
    }
}
