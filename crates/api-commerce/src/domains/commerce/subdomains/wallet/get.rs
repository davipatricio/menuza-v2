//! `GET /wallet` — a customer's stored balance and the whole signed ledger
//! behind it, newest first.
//!
//! The ledger is not paged: a customer wallet has one row per order, and paging
//! it would hide the total the balance is a rollup of. A customer without a
//! wallet has no balance, not an error.

use axum::Json;
use axum::extract::{Query, State};
use contract::commerce::wallet::{GetWalletInput, Wallet};
use menuza_http::extract::{CommerceSession, TenantScope};
use persistence::commerce::wallet;

use super::tenant_of;
use crate::domains::commerce::support::{ApiError, db_error, require_capability, require_member};

#[utoipa::path(
    get,
    path = "/wallet",
    operation_id = "getWallet",
    tag = "wallet",
    params(("customerId" = String, Query, description = "Customer whose wallet to read.")),
    responses(
        (status = 200, body = Wallet),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_wallet(
    State(state): State<crate::State>,
    scope: TenantScope,
    session: CommerceSession,
    Query(input): Query<GetWalletInput>,
) -> Result<Json<Wallet>, ApiError> {
    let tenant = tenant_of(&scope)?;
    let member = require_member(&state.pool, &tenant, &session.0).await?;
    require_capability(&member, "orders:read")?;

    if !wallet::customer_exists(&state.pool, &tenant, &input.customer_id)
        .await
        .map_err(db_error)?
    {
        return Err(ApiError::not_found());
    }

    let Some(stored) = wallet::wallet_by_customer(&state.pool, &tenant, &input.customer_id)
        .await
        .map_err(db_error)?
    else {
        return Ok(Json(Wallet {
            balance_cents: 0,
            transactions: Vec::new(),
        }));
    };

    let transactions = wallet::transactions(&state.pool, &tenant, &stored.id)
        .await
        .map_err(db_error)?;

    Ok(Json(Wallet {
        balance_cents: stored.balance_cents,
        transactions,
    }))
}
