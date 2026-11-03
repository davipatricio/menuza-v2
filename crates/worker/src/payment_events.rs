//! `payment-events`: one job per gateway callback the commerce API recorded.
//!
//! The webhook receiver stores the `GatewayEvent` row and enqueues inside the
//! same transaction (a later slice); this job applies the recorded event through
//! `commerce::payments::apply_gateway_event`, which locks the row for the whole
//! apply. A second delivery therefore answers from the row instead of paying the
//! order twice, and `orders::mark_paid` refuses to credit the cashback again.

use persistence::commerce::payments::{self, GatewayError};
use persistence::tenant::TenantId;
use riverqueue::{InsertOpts, Job, JobArgs, WorkContext, WorkOutcome, Workers};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::queue;

/// Arguments of one apply, and the whole of its identity.
#[derive(Debug, Deserialize, Serialize)]
pub struct PaymentEvent {
    pub tenant_id: String,
    pub gateway_event_id: String,
}

impl JobArgs for PaymentEvent {
    const KIND: &'static str = queue::PAYMENT_EVENTS;

    fn default_insert_opts() -> InsertOpts {
        queue::insert_opts(Self::KIND)
    }
}

impl PaymentEvent {
    /// The key the BullMQ job id carried. River dedupes on the arguments, so
    /// this names the job for logs and tests rather than constraining it.
    pub fn idempotency_key(&self) -> String {
        self.gateway_event_id.clone()
    }
}

/// Apply one recorded gateway event.
///
/// A not-found event is an error on purpose: the callback may commit after the
/// job is visible, so it retries inside the five-attempt budget and is then
/// discarded rather than silently dropped.
pub async fn work(pool: &PgPool, args: &PaymentEvent) -> Result<WorkOutcome, GatewayError> {
    let Ok(tenant) = TenantId::parse(&args.tenant_id) else {
        // A blank tenant id can never name a row, so no retry can help it.
        tracing::warn!(key = %args.idempotency_key(), "discarded: tenant id is empty");

        return Ok(WorkOutcome::Discard);
    };

    let applied = payments::apply_gateway_event(pool, &tenant, &args.gateway_event_id).await?;

    tracing::info!(key = %args.idempotency_key(), status = ?applied.status, "gateway event applied");

    Ok(WorkOutcome::Complete)
}

/// Register the kind on the process's worker bundle.
pub fn register(workers: &mut Workers, pool: &PgPool) -> Result<(), riverqueue::Error> {
    let pool = pool.clone();

    workers.add_fn(move |_context: WorkContext, job: Job<PaymentEvent>| {
        let pool = pool.clone();

        async move { work(&pool, &job.args).await }
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use riverqueue::{JobArgs, WorkOutcome};
    use sqlx::postgres::PgPoolOptions;

    use super::{PaymentEvent, work};

    /// A pool that never connects: the tests below must not reach a database.
    fn unconnected_pool() -> sqlx::PgPool {
        PgPoolOptions::new()
            .connect_lazy("postgres://menuza@127.0.0.1:1/menuza")
            .expect("the URL parses")
    }

    #[test]
    fn key_is_the_gateway_event_id() {
        let args = PaymentEvent {
            tenant_id: "t-1".to_owned(),
            gateway_event_id: "evt_123".to_owned(),
        };

        assert_eq!(args.idempotency_key(), "evt_123");
    }

    #[test]
    fn kind_and_queue_are_the_bullmq_name() {
        assert_eq!(PaymentEvent::KIND, "payment-events");
        assert_eq!(
            PaymentEvent::default_insert_opts().queue(),
            Some("payment-events")
        );
    }

    #[tokio::test]
    async fn a_blank_tenant_id_is_discarded_without_a_query() {
        let args = PaymentEvent {
            tenant_id: String::new(),
            gateway_event_id: "evt_123".to_owned(),
        };

        let outcome = work(&unconnected_pool(), &args)
            .await
            .expect("a discard is not an error");

        assert_eq!(outcome, WorkOutcome::Discard);
    }
}
