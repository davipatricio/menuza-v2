//! Helpers shared by the push handlers.
//!
//! Push is tenant-scoped even though the surface is a member's devices: the
//! proxy writes `x-menuza-tenant-id` from the request host, the session proves
//! the member, and the membership row proves the two belong together. A member
//! with no membership answers `FORBIDDEN`, exactly like `authMiddleware`.

use menuza_http::extract::TenantScope;
use persistence::tenant::TenantId;
use persistence::tenant::membership::membership_role;

use crate::domains::tenant::support::{ApiError, StoreMember, db_error, require_member, tenant_of};

/// The tenant the proxy resolved and the member whose cookie matches it.
pub async fn require_push_member(
    state: &crate::State,
    scope: &TenantScope,
    raw_token: &str,
) -> Result<(TenantId, StoreMember), ApiError> {
    let tenant = tenant_of(scope)?;
    let member = require_member(&state.pool, raw_token).await?;

    membership_role(&state.pool, &tenant, &member.member_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::forbidden)?;

    Ok((tenant, member))
}
