//! payments subdomain queries, ported from the Bun persistence layer.
//!
//! The worker-facing half of a gateway callback: the webhook receiver has
//! already persisted the `GatewayEvent` row, and this replays it through the
//! same paid path a member action takes. Only `paid` moves an order; a declined
//! payment is recorded and the order keeps its window (PRODUCT.md §10), and
//! refunds, cancellations and chargebacks are recorded and ignored — the store
//! owns those paths in the panel.
//!
//! Idempotent on both sides: an event that reached a terminal status is
//! answered from the row, and [`orders::mark_paid`] refuses to credit the
//! cashback twice. Every statement binds `"tenantId"` and the whole apply is one
//! transaction, so a replayed callback cannot settle the event before the order
//! is paid.

use contract::commerce::payments::{ApplyGatewayEventOutput, GatewayEventOutcome};
use sqlx::PgPool;

use crate::commerce::orders::{self, PaidOrder};
use crate::tenant::{TenantId, begin_scoped};

/// Why applying a gateway event was refused.
#[derive(Debug, thiserror::Error)]
pub enum GatewayError {
    /// No such event in this tenant.
    #[error("gateway event not found")]
    NotFound,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// `POST /payments/gateway-events/{gatewayEventId}/apply`.
///
/// The event row is locked for the whole transaction, so two drains of the same
/// event serialize: the second sees `processed` and answers without touching the
/// order. An event that is already terminal (`processed`, `ignored`, `rejected`)
/// is answered from its status and never replayed.
pub async fn apply_gateway_event(
    pool: &PgPool,
    tenant: &TenantId,
    gateway_event_id: &str,
) -> Result<ApplyGatewayEventOutput, GatewayError> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let event = sqlx::query!(
        r#"
        SELECT id, provider, type AS event_type,
               "orderCode" AS order_code,
               "amountCents" AS amount_cents,
               status
        FROM public."GatewayEvent"
        WHERE "tenantId" = $1 AND id = $2
        FOR UPDATE
        "#,
        tenant.as_str(),
        gateway_event_id,
    )
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(GatewayError::NotFound)?;

    let event = GatewayEventRow {
        id: event.id,
        provider: event.provider,
        event_type: event.event_type,
        order_code: event.order_code,
        amount_cents: event.amount_cents,
        status: event.status,
    };

    if let Some(status) = settled(&event.status) {
        return Ok(ApplyGatewayEventOutput { status });
    }

    let outcome = match decide(tenant, &event, &mut tx).await? {
        Instruction::Settle { status, detail } => {
            finish(&mut tx, tenant, &event.id, status, Some(&detail)).await?;
            settled(status).unwrap_or(GatewayEventOutcome::Applied)
        }
        Instruction::Pay(order) => {
            orders::mark_paid(
                &mut tx,
                tenant,
                &order,
                None,
                Some(&format!("Confirmado pelo provedor ({}).", event.event_type)),
            )
            .await?;

            finish(&mut tx, tenant, &event.id, "processed", None).await?;
            GatewayEventOutcome::Applied
        }
    };

    tx.commit().await?;

    Ok(ApplyGatewayEventOutput { status: outcome })
}

/// The recorded event columns the decision reads.
struct GatewayEventRow {
    id: String,
    provider: String,
    event_type: String,
    order_code: Option<String>,
    amount_cents: Option<i32>,
    status: String,
}

/// What the decision settled on.
enum Instruction {
    Settle {
        status: &'static str,
        detail: String,
    },
    Pay(PaidOrder),
}

/// Port of `OUTCOME_OF`: a terminal status, as the outcome the caller sees.
/// Used both for an already-decided event and for the status a fresh decision
/// settled on.
fn settled(status: &str) -> Option<GatewayEventOutcome> {
    match status {
        "processed" => Some(GatewayEventOutcome::Applied),
        "ignored" => Some(GatewayEventOutcome::Ignored),
        "rejected" => Some(GatewayEventOutcome::Rejected),
        _ => None,
    }
}

/// Turns one event into either "close it with this status" or "mark this order
/// paid". Every refusal is a settled event, never a thrown error: an event the
/// platform will not act on is still information the store needs to see.
async fn decide(
    tenant: &TenantId,
    event: &GatewayEventRow,
    tx: &mut sqlx::PgConnection,
) -> Result<Instruction, GatewayError> {
    let action = if event.provider == "pagarme" {
        map_pagar_me_event_type(&event.event_type)
    } else {
        "ignored"
    };

    if action == "ignored" {
        return Ok(close("ignored", "Evento sem efeito sobre o pedido."));
    }

    let Some(order_code) = event.order_code.as_deref() else {
        return Ok(close("ignored", "Evento sem código de pedido."));
    };

    let order = sqlx::query!(
        r#"
        SELECT id, code, "customerId" AS customer_id,
               "cashbackCents" AS cashback_cents,
               "financialStatus" AS financial_status,
               "totalCents" AS total_cents
        FROM public."Order"
        WHERE "tenantId" = $1 AND code = $2
        FOR UPDATE
        "#,
        tenant.as_str(),
        order_code,
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(order) = order else {
        return Ok(close("ignored", "Pedido não encontrado nesta loja."));
    };

    if action == "payment_failed" {
        // Not terminal: the buyer may retry or switch method (PRODUCT.md §10),
        // so the order keeps both its status and its window.
        return Ok(close(
            "processed",
            "Pagamento recusado; o pedido segue aguardando.",
        ));
    }

    // The amount is the one thing a callback must not be trusted about blindly:
    // a confirmation for a different amount would mark the wrong money as paid.
    if event
        .amount_cents
        .is_some_and(|amount_cents| amount_cents != order.total_cents)
    {
        return Ok(close(
            "rejected",
            format!(
                "Valor divergente: recebido {}, esperado {}.",
                event.amount_cents.unwrap_or_default(),
                order.total_cents
            ),
        ));
    }

    Ok(Instruction::Pay(PaidOrder {
        id: order.id,
        code: order.code,
        customer_id: order.customer_id,
        cashback_cents: order.cashback_cents,
        financial_status: order.financial_status,
    }))
}

fn close(status: &'static str, detail: impl Into<String>) -> Instruction {
    Instruction::Settle {
        status,
        detail: detail.into(),
    }
}

/// Writes the event's terminal status, the receipt that it was applied.
async fn finish(
    tx: &mut sqlx::PgConnection,
    tenant: &TenantId,
    gateway_event_id: &str,
    status: &str,
    detail: Option<&str>,
) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().naive_utc();

    sqlx::query!(
        r#"
        UPDATE public."GatewayEvent"
        SET status = $3, detail = $4, "processedAt" = $5
        WHERE "tenantId" = $1 AND id = $2
        "#,
        tenant.as_str(),
        gateway_event_id,
        status,
        detail,
        now,
    )
    .execute(&mut *tx)
    .await?;

    Ok(())
}

/// Port of `mapPagarMeEventType`: the only events that move an order are the
/// ones that say its money landed, plus the refusal worth recording.
fn map_pagar_me_event_type(event_type: &str) -> &'static str {
    match event_type {
        "order.paid" | "charge.paid" => "paid",
        "order.payment_failed" | "charge.payment_failed" => "payment_failed",
        _ => "ignored",
    }
}
