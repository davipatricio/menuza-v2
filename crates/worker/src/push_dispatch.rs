//! `push-notifications`: fan one event out to the tenant's subscriptions.
//!
//! The job names the event and, optionally, the members who should hear it.
//! Recipients are the members who enabled that event *and* still belong to the
//! tenant; each of their subscriptions is then posted to, unless preference,
//! membership or the endpoint allowlist removes it. A 404/410 deletes the row:
//! the push service has said that device can never be reached again.
//!
//! A failed send is counted, not raised. The job is fanned out, so a retry would
//! re-deliver to everyone who already got it; the counters in the log are the
//! record of the partial failure.

use std::fmt::Write as _;

use persistence::tenant::TenantId;
use persistence::tenant::push as store;
use riverqueue::{InsertOpts, Job, JobArgs, WorkContext, WorkOutcome, Workers};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use contract::tenant::push::{PushEvent, is_allowed_push_endpoint};

use crate::push_sender::{self, PushSubscription, Vapid};
use crate::queue;

/// One push event for one tenant.
#[derive(Debug, Deserialize, Serialize)]
pub struct PushDispatch {
    pub tenant_id: String,
    pub event: String,
    #[serde(default)]
    pub target_member_ids: Vec<String>,
    #[serde(default)]
    pub order_id: Option<String>,
}

impl JobArgs for PushDispatch {
    const KIND: &'static str = queue::PUSH_NOTIFICATIONS;

    fn default_insert_opts() -> InsertOpts {
        queue::insert_opts(Self::KIND)
    }
}

impl PushDispatch {
    /// The key the BullMQ job id carried, derived from the envelope so a
    /// re-enqueue of the same event dedupes. River dedupes on the arguments, so
    /// this names the job for logs and tests rather than constraining it.
    ///
    /// ADR-0008 says `push-<sha1-16>`; sha1 is not in the workspace, so this is
    /// sha256 truncated to the same 16 hex characters.
    pub fn idempotency_key(&self) -> String {
        let canonical = format!(
            "{}|{}|{}|{}",
            self.tenant_id,
            self.event,
            self.target_member_ids.join(","),
            self.order_id.as_deref().unwrap_or_default()
        );

        let digest = Sha256::digest(canonical.as_bytes());

        let mut hex = String::with_capacity(16);

        for byte in digest.iter().take(8) {
            let _ = write!(hex, "{byte:02x}");
        }

        format!("push-{hex}")
    }
}

/// Why the fan-out could not finish. A send error is not one of these: it is
/// counted and logged, because the other recipients already have their copy.
#[derive(Debug, thiserror::Error)]
pub enum PushError {
    #[error("push storage failed")]
    Database(#[from] sqlx::Error),
    #[error("the notification payload could not be encoded")]
    Payload(#[from] serde_json::Error),
}

/// The body the service worker shows, matching the Bun dispatcher's copy.
fn notification(event: PushEvent, order_id: Option<&str>) -> serde_json::Value {
    let order = order_id.unwrap_or_default();

    let (title, body) = match event {
        PushEvent::OrderCreated => ("Novo Pedido", format!("Novo pedido #{order} recebido")),
        PushEvent::PaymentConfirmed => (
            "Pagamento Confirmado",
            format!("Pagamento do pedido #{order} confirmado"),
        ),
        PushEvent::PixExpired => (
            "Pix Expirado",
            format!("Cobrança Pix do pedido #{order} expirou"),
        ),
        PushEvent::OrderReady => (
            "Pedido Pronto",
            format!("Pedido #{order} está pronto para entrega/retirada"),
        ),
        PushEvent::OrderCancelled => ("Pedido Cancelado", format!("Pedido #{order} foi cancelado")),
    };

    serde_json::json!({
        "title": title,
        "body": body,
        "url": "/manage/orders",
        "tag": format!("order-{}", order_id.unwrap_or(event.as_str())),
    })
}

/// Fan `args.event` out to the tenant's subscriptions.
pub async fn work(pool: &PgPool, args: &PushDispatch) -> Result<WorkOutcome, PushError> {
    let Ok(tenant) = TenantId::parse(&args.tenant_id) else {
        // A blank tenant id can never name a row, so no retry can help it.
        tracing::warn!(key = %args.idempotency_key(), "discarded: tenant id is empty");

        return Ok(WorkOutcome::Discard);
    };

    let Some(event) = PushEvent::parse(&args.event) else {
        // An unknown event is a producer bug, not a transient failure.
        tracing::warn!(
            key = %args.idempotency_key(),
            event = %args.event,
            "discarded: unknown push event"
        );

        return Ok(WorkOutcome::Discard);
    };

    // No keys means push is switched off for this deployment: the job has
    // nothing to do and nothing to retry.
    let Some(vapid) = Vapid::from_env() else {
        tracing::info!(key = %args.idempotency_key(), "push disabled: no VAPID keys");

        return Ok(WorkOutcome::Complete);
    };

    let mut recipients = store::push_event_members(pool, &tenant, event.as_str()).await?;

    if !args.target_member_ids.is_empty() {
        recipients.retain(|member| args.target_member_ids.contains(member));
    }

    if recipients.is_empty() {
        tracing::info!(key = %args.idempotency_key(), "no recipient enabled this event");

        return Ok(WorkOutcome::Complete);
    }

    let subscriptions = store::push_subscriptions_for_members(pool, &tenant, &recipients).await?;
    let payload = serde_json::to_vec(&notification(event, args.order_id.as_deref()))?;

    let mut sent = 0usize;
    let mut expired = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;

    for subscription in subscriptions {
        if !is_allowed_push_endpoint(&subscription.endpoint) {
            // A stored endpoint outside the provider allowlist is never posted
            // to; the next registration replaces it.
            skipped += 1;

            continue;
        }

        let target = PushSubscription {
            endpoint: &subscription.endpoint,
            p256dh: &subscription.p256dh,
            auth: &subscription.auth,
        };

        match push_sender::send(&vapid, &target, &payload).await {
            Ok(response) if response.is_gone() => {
                // The device is already gone; if the prune itself fails it is
                // counted, never raised, because a retry would notify everyone
                // who already got their copy.
                match store::push_subscription_delete_by_id(pool, &tenant, &subscription.id).await {
                    Ok(_) => expired += 1,
                    Err(error) => {
                        failed += 1;

                        tracing::warn!(
                            key = %args.idempotency_key(),
                            %error,
                            "gone subscription could not be pruned"
                        );
                    }
                }
            }
            Ok(response) if response.is_success() => sent += 1,
            Ok(response) => {
                failed += 1;

                tracing::warn!(
                    key = %args.idempotency_key(),
                    status = response.status,
                    "push service refused the notification"
                );
            }
            Err(error) => {
                failed += 1;

                tracing::warn!(key = %args.idempotency_key(), %error, "push send failed");
            }
        }
    }

    tracing::info!(
        key = %args.idempotency_key(),
        tenant = %tenant,
        event = %event.as_str(),
        sent,
        expired,
        failed,
        skipped,
        "push dispatch finished"
    );

    Ok(WorkOutcome::Complete)
}

/// Register the kind on the process's worker bundle.
pub fn register(workers: &mut Workers, pool: &PgPool) -> Result<(), riverqueue::Error> {
    let pool = pool.clone();

    workers.add_fn(move |_context: WorkContext, job: Job<PushDispatch>| {
        let pool = pool.clone();

        async move { work(&pool, &job.args).await }
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use riverqueue::{JobArgs, WorkOutcome};
    use sqlx::postgres::PgPoolOptions;

    use super::{PushDispatch, notification, work};
    use contract::tenant::push::PushEvent;

    fn args(event: &str) -> PushDispatch {
        PushDispatch {
            tenant_id: "t-1".to_owned(),
            event: event.to_owned(),
            target_member_ids: vec!["m-1".to_owned()],
            order_id: Some("o-1".to_owned()),
        }
    }

    /// A pool that never connects: the tests below must not reach a database.
    fn unconnected_pool() -> sqlx::PgPool {
        PgPoolOptions::new()
            .connect_lazy("postgres://menuza@127.0.0.1:1/menuza")
            .expect("the URL parses")
    }

    #[test]
    fn key_is_prefixed_and_sixteen_hex_characters() {
        let key = args("ORDER_CREATED").idempotency_key();

        assert!(key.starts_with("push-"), "{key}");
        assert_eq!(key.len(), "push-".len() + 16, "{key}");
        assert!(key["push-".len()..].chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn key_is_stable_and_discriminates_the_envelope() {
        assert_eq!(
            args("ORDER_CREATED").idempotency_key(),
            args("ORDER_CREATED").idempotency_key()
        );
        assert_ne!(
            args("ORDER_CREATED").idempotency_key(),
            args("ORDER_READY").idempotency_key()
        );
    }

    #[test]
    fn kind_and_queue_are_the_bullmq_name() {
        assert_eq!(PushDispatch::KIND, "push-notifications");
        assert_eq!(
            PushDispatch::default_insert_opts().queue(),
            Some("push-notifications")
        );
    }

    #[test]
    fn the_notification_carries_the_events_copy() {
        assert_eq!(
            notification(PushEvent::OrderReady, Some("o-1")),
            serde_json::json!({
                "title": "Pedido Pronto",
                "body": "Pedido #o-1 está pronto para entrega/retirada",
                "url": "/manage/orders",
                "tag": "order-o-1",
            })
        );
    }

    #[tokio::test]
    async fn a_blank_tenant_id_is_discarded_without_a_query() {
        let mut args = args("ORDER_CREATED");
        args.tenant_id = "  ".to_owned();

        let outcome = work(&unconnected_pool(), &args)
            .await
            .expect("a discard is not an error");

        assert_eq!(outcome, WorkOutcome::Discard);
    }

    #[tokio::test]
    async fn an_unknown_event_is_discarded_without_a_query() {
        let outcome = work(&unconnected_pool(), &args("ORDER_SOMETHING"))
            .await
            .expect("a discard is not an error");

        assert_eq!(outcome, WorkOutcome::Discard);
    }
}
