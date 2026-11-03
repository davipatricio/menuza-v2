//! Job arguments whose producer inserts them inside a business transaction.
//!
//! The handler lives in `crates/worker`; the arguments type lives here because
//! River's insert takes the type itself, not a raw envelope, and the insert runs
//! in the transaction that writes the row the job is about. Keeping one
//! definition is what stops the producer and the consumer from drifting.
//!
//! Uniqueness is River's `by_args` over the encoded arguments, the replacement
//! for the old deterministic BullMQ job ids (ADR-0008).

use riverqueue::{InsertOpts, JobArgs, UniqueOpts};
use serde::{Deserialize, Serialize};

/// The `orders-expiry` queue, named after the BullMQ queue it replaces.
pub const ORDERS_EXPIRY: &str = "orders-expiry";

/// Attempts every kind gets: the BullMQ cutover's five, then discard.
pub const MAX_ATTEMPTS: i32 = 5;

/// Insert defaults every kind shares: the attempt budget, the queue it belongs
/// to, and uniqueness over the encoded arguments.
pub fn insert_opts(queue: &'static str) -> InsertOpts {
    InsertOpts::default()
        .with_max_attempts(MAX_ATTEMPTS)
        .with_queue(queue)
        .with_unique(UniqueOpts::new().with_by_args(true))
}

/// Arguments of one expiry, and the whole of its identity.
#[derive(Debug, Deserialize, Serialize)]
pub struct OrderExpiry {
    pub tenant_id: String,
    pub order_code: String,
}

impl JobArgs for OrderExpiry {
    const KIND: &'static str = ORDERS_EXPIRY;

    fn default_insert_opts() -> InsertOpts {
        insert_opts(Self::KIND)
    }
}

impl OrderExpiry {
    /// The key the BullMQ job id carried. River dedupes on the arguments, so
    /// this names the job for logs and tests rather than constraining it.
    pub fn idempotency_key(&self) -> String {
        format!("orders-expiry-{}", self.order_code)
    }
}

#[cfg(test)]
mod tests {
    use riverqueue::JobArgs;

    use super::{ORDERS_EXPIRY, OrderExpiry};

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
        assert_eq!(OrderExpiry::KIND, ORDERS_EXPIRY);
        assert_eq!(
            OrderExpiry::default_insert_opts().queue(),
            Some(ORDERS_EXPIRY)
        );
    }
}
