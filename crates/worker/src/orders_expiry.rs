//! `orders-expiry`: one delayed job per order code.
//!
//! Enqueued inside the order transaction, at the payment window's deadline, by
//! `persistence::commerce::orders::create`; the job asks persistence to expire
//! the order once the window has closed. It is idempotent by construction: `commerce::orders::expire` is a
//! no-op unless the order is still `awaiting_payment` and its `expiresAt` has
//! passed, so a replayed job neither expires a paid order nor releases its
//! reserve twice.

use persistence::commerce::orders::{self, OrderError};
use persistence::tenant::TenantId;
use riverqueue::{Job, WorkContext, WorkOutcome, Workers};
use sqlx::PgPool;

/// Arguments of one expiry, and the whole of its identity.
///
/// Defined in `persistence::jobs` because the order transaction inserts it; the
/// handler stays here.
pub use persistence::jobs::OrderExpiry;

/// Expire one order, if its window has closed.
pub async fn work(pool: &PgPool, args: &OrderExpiry) -> Result<WorkOutcome, OrderError> {
    let Ok(tenant) = TenantId::parse(&args.tenant_id) else {
        // A blank tenant id can never name a row, so no retry can help it.
        tracing::warn!(key = %args.idempotency_key(), "discarded: tenant id is empty");

        return Ok(WorkOutcome::Discard);
    };

    match orders::expire(pool, &tenant, &args.order_code).await {
        Ok(status) => {
            tracing::info!(key = %args.idempotency_key(), %status, "order expiry applied");

            Ok(WorkOutcome::Complete)
        }
        // The order is gone, so there is nothing left to expire.
        Err(OrderError::NotFound) => {
            tracing::warn!(key = %args.idempotency_key(), "order not found; nothing to expire");

            Ok(WorkOutcome::Complete)
        }
        Err(error) => Err(error),
    }
}

/// Register the kind on the process's worker bundle.
pub fn register(workers: &mut Workers, pool: &PgPool) -> Result<(), riverqueue::Error> {
    let pool = pool.clone();

    workers.add_fn(move |_context: WorkContext, job: Job<OrderExpiry>| {
        let pool = pool.clone();

        async move { work(&pool, &job.args).await }
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use riverqueue::{JobArgs, WorkOutcome};
    use sqlx::postgres::PgPoolOptions;

    use super::{OrderExpiry, work};

    /// A pool that never connects: the tests below must not reach a database.
    fn unconnected_pool() -> sqlx::PgPool {
        PgPoolOptions::new()
            .connect_lazy("postgres://menuza@127.0.0.1:1/menuza")
            .expect("the URL parses")
    }

    #[test]
    fn key_is_the_documented_order_key() {
        let args = OrderExpiry {
            tenant_id: "t-1".to_owned(),
            order_code: "o-1".to_owned(),
        };

        assert_eq!(args.idempotency_key(), "orders-expiry-o-1");
    }

    #[test]
    fn kind_and_queue_are_the_bullmq_name() {
        assert_eq!(OrderExpiry::KIND, "orders-expiry");
        assert_eq!(
            OrderExpiry::default_insert_opts().queue(),
            Some("orders-expiry")
        );
    }

    #[tokio::test]
    async fn a_blank_tenant_id_is_discarded_without_a_query() {
        let args = OrderExpiry {
            tenant_id: "   ".to_owned(),
            order_code: "o-1".to_owned(),
        };

        let outcome = work(&unconnected_pool(), &args)
            .await
            .expect("a discard is not an error");

        assert_eq!(outcome, WorkOutcome::Discard);
    }
}
