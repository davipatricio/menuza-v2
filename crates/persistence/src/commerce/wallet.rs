//! wallet subdomain queries, ported from the Bun persistence layer.
//!
//! A customer's balance is the stored `Wallet."balanceCents"`, the ledger is
//! `WalletTransaction`. Every statement binds `"tenantId"`: one wallet per
//! customer per tenant, and an id lookup also matches on the tenant.

use chrono::{NaiveDateTime, SecondsFormat};
use contract::commerce::wallet::WalletTransaction;
use sqlx::PgPool;

use crate::tenant::{TenantId, begin_scoped};

/// The `Wallet` row behind a customer's ledger.
pub struct WalletRow {
    pub id: String,
    pub balance_cents: i32,
}

/// Why an adjustment was refused.
#[derive(Debug, thiserror::Error)]
pub enum AdjustError {
    /// No such customer in this tenant.
    #[error("customer not found")]
    NotFound,
    /// The entry would push the stored balance below zero.
    #[error("insufficient balance")]
    Insufficient,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// The kind an operator correction is written as. The shared `adjust` helper
/// pins it to `adjustment` for a credit and a debit alike, and the
/// `WalletTransaction.kind` CHECK allows no `credit`/`debit` rows.
const ADJUSTMENT_KIND: &str = "adjustment";

/// `Timestamp(3)` → RFC 3339 with milliseconds and a trailing `Z`, the shape the
/// Bun backend's `Date.toISOString()` produced.
fn to_iso(timestamp: NaiveDateTime) -> String {
    timestamp
        .and_utc()
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Whether the customer exists in this tenant. A database failure is an error,
/// not an absent customer: the caller must not answer `NOT_FOUND` for a broken
/// read.
pub async fn customer_exists(
    pool: &PgPool,
    tenant: &TenantId,
    customer_id: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT id
        FROM public."Customer"
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        customer_id,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.is_some())
}

/// The customer's wallet, or `None` when they have none yet. A customer
/// without a wallet has no balance, not an error.
pub async fn wallet_by_customer(
    pool: &PgPool,
    tenant: &TenantId,
    customer_id: &str,
) -> Result<Option<WalletRow>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT id, "balanceCents" AS balance_cents
        FROM public."Wallet"
        WHERE "tenantId" = $1 AND "customerId" = $2
        "#,
        tenant.as_str(),
        customer_id,
    )
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|row| WalletRow {
        id: row.id,
        balance_cents: row.balance_cents,
    }))
}

/// One `WalletTransaction` row.
struct TransactionRow {
    id: String,
    kind: String,
    amount_cents: i32,
    order_id: Option<String>,
    reason: Option<String>,
    created_at: NaiveDateTime,
}

/// The whole ledger for one wallet, newest first. A customer wallet has one row
/// per order, and the history is what the balance is a rollup of.
pub async fn transactions(
    pool: &PgPool,
    tenant: &TenantId,
    wallet_id: &str,
) -> Result<Vec<WalletTransaction>, sqlx::Error> {
    let rows = sqlx::query_as!(
        TransactionRow,
        r#"
        SELECT id, kind, "amountCents" AS amount_cents, "orderId" AS order_id,
               reason, "createdAt" AS created_at
        FROM public."WalletTransaction"
        WHERE "tenantId" = $1 AND "walletId" = $2
        ORDER BY "createdAt" DESC, id DESC
        "#,
        tenant.as_str(),
        wallet_id,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| WalletTransaction {
            id: row.id,
            kind: row.kind,
            amount_cents: row.amount_cents,
            order_id: row.order_id,
            reason: row.reason,
            created_at: to_iso(row.created_at),
        })
        .collect())
}

/// Writes one cashback credit inside an open transaction and rolls the stored
/// balance forward. Returns whether a ledger entry was written.
///
/// The wallet row is locked before it is read, so a credit here cannot race
/// another movement into the same balance. A customer without a wallet, or an
/// order whose cashback is zero, has nothing to credit: the caller still records
/// the payment, there is just no entry. The entry kind is `cashback_credit`,
/// the one the ledger contract defines for order cashback.
pub(crate) async fn credit_cashback(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    customer_id: &str,
    order_id: &str,
    code: &str,
    amount_cents: i32,
    actor_member_id: Option<&str>,
) -> Result<bool, sqlx::Error> {
    if amount_cents <= 0 {
        return Ok(false);
    }

    let wallet = sqlx::query!(
        r#"
        SELECT id
        FROM public."Wallet"
        WHERE "tenantId" = $1 AND "customerId" = $2
        FOR UPDATE
        "#,
        tenant.as_str(),
        customer_id,
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(wallet) = wallet else {
        return Ok(false);
    };

    let now = chrono::Utc::now().naive_utc();

    sqlx::query!(
        r#"
        INSERT INTO public."WalletTransaction" (
            id, "tenantId", "walletId", "orderId", kind, "amountCents",
            "actorMemberId", reason, "createdAt"
        )
        VALUES ($1, $2, $3, $4, 'cashback_credit', $5, $6, $7, $8)
        "#,
        uuid::Uuid::new_v4().to_string(),
        tenant.as_str(),
        wallet.id,
        order_id,
        amount_cents,
        actor_member_id,
        format!("Cashback do pedido {code}"),
        now,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query!(
        r#"
        UPDATE public."Wallet"
        SET "balanceCents" = "balanceCents" + $3, "updatedAt" = $4
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        wallet.id,
        amount_cents,
        now,
    )
    .execute(&mut *tx)
    .await?;

    Ok(true)
}

/// Writes one manual correction and rolls the stored balance forward. Returns
/// the new balance.
///
/// A customer without a wallet is not an error: the balance is 0 and the
/// adjustment opens the wallet, which is what a first store credit is. The
/// wallet row is locked before its balance is read, so two adjustments cannot
/// both act on the same balance and the second one cannot silently overwrite
/// the first. The balance never goes negative — the CHECK on `Wallet` would
/// refuse it anyway — and that refusal is what the handler turns into a
/// `CONFLICT`.
pub async fn adjust(
    pool: &PgPool,
    tenant: &TenantId,
    customer_id: &str,
    amount_cents: i32,
    reason: &str,
    actor_member_id: &str,
) -> Result<i32, AdjustError> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let customer = sqlx::query!(
        r#"
        SELECT id
        FROM public."Customer"
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        customer_id,
    )
    .fetch_optional(&mut **tx)
    .await?;

    if customer.is_none() {
        return Err(AdjustError::NotFound);
    }

    let wallet = sqlx::query!(
        r#"
        SELECT id, "balanceCents" AS balance_cents
        FROM public."Wallet"
        WHERE "tenantId" = $1 AND "customerId" = $2
        FOR UPDATE
        "#,
        tenant.as_str(),
        customer_id,
    )
    .fetch_optional(&mut **tx)
    .await?;

    let now = chrono::Utc::now().naive_utc();

    let (wallet_id, balance_cents) = match wallet {
        Some(wallet) => (wallet.id, wallet.balance_cents),
        None => {
            let wallet_id = uuid::Uuid::new_v4().to_string();

            sqlx::query!(
                r#"
                INSERT INTO public."Wallet" (
                    id, "tenantId", "customerId", "balanceCents", "createdAt", "updatedAt"
                )
                VALUES ($1, $2, $3, 0, $4, $4)
                "#,
                wallet_id,
                tenant.as_str(),
                customer_id,
                now,
            )
            .execute(&mut **tx)
            .await?;

            (wallet_id, 0)
        }
    };

    let balance_after_cents = balance_cents
        .checked_add(amount_cents)
        .ok_or(AdjustError::Insufficient)?;

    if balance_after_cents < 0 {
        return Err(AdjustError::Insufficient);
    }

    let transaction_id = uuid::Uuid::new_v4().to_string();

    sqlx::query!(
        r#"
        INSERT INTO public."WalletTransaction" (
            id, "tenantId", "walletId", "orderId", kind, "amountCents",
            "actorMemberId", reason, "createdAt"
        )
        VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8)
        "#,
        transaction_id,
        tenant.as_str(),
        wallet_id,
        ADJUSTMENT_KIND,
        amount_cents,
        actor_member_id,
        reason,
        now,
    )
    .execute(&mut **tx)
    .await?;

    sqlx::query!(
        r#"
        UPDATE public."Wallet"
        SET "balanceCents" = $3, "updatedAt" = $4
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        wallet_id,
        balance_after_cents,
        now,
    )
    .execute(&mut **tx)
    .await?;

    tx.commit().await?;

    Ok(balance_after_cents)
}
