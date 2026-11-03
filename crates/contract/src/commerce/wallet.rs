//! wallet subdomain DTOs, ported from the Bun contract.
//!
//! One wallet per customer per tenant; `balanceCents` is the rollup of the
//! signed `amountCents` ledger.

use crate::ErrorCode;

/// `GET /wallet` query: whose wallet to read.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetWalletInput {
    pub customer_id: String,
}

/// `POST /wallet/adjust` body: an operator correction. The sign is the
/// caller's, so the same body covers a store credit and a clawback.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdjustWalletInput {
    pub customer_id: String,
    /// Signed cents as stored: a credit is positive, a debit negative.
    pub amount_cents: i32,
    pub reason: String,
}

impl AdjustWalletInput {
    /// The input schema's own gates: every string is non-empty and
    /// `amountCents` is not zero. A refusal is `VALIDATION_FAILED`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.customer_id.is_empty() || self.reason.is_empty() || self.amount_cents == 0 {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `POST /wallet/adjust` answer: the balance the correction left behind.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AdjustWalletOutput {
    pub balance_cents: i32,
}

/// One ledger entry. `amountCents` is signed: a credit is positive, a
/// reserve/spend/reversal negative.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WalletTransaction {
    pub id: String,
    pub kind: String,
    pub amount_cents: i32,
    pub order_id: Option<String>,
    pub reason: Option<String>,
    /// RFC 3339 with milliseconds and a trailing `Z`.
    pub created_at: String,
}

/// A customer's wallet: the stored balance and the whole signed ledger behind
/// it, newest first.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Wallet {
    pub balance_cents: i32,
    pub transactions: Vec<WalletTransaction>,
}
