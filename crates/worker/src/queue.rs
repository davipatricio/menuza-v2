//! Shared River plumbing: the three queue names, the retry budget they share
//! and the client settings they are drained with.
//!
//! River 0.4 has no caller-supplied idempotency key: uniqueness is a set of
//! dimensions, and the one that matches the old deterministic BullMQ job ids is
//! `by_args` over arguments carrying the tenant and the identifying field. See
//! ADR-0008 and `crates/worker/AGENTS.md`.

use std::time::Duration;

use riverqueue::QueueConfig;

/// The `orders-expiry` name and its insert defaults live with the producer, in
/// `persistence::jobs`; this crate re-exports them so the two cannot drift.
pub use persistence::jobs::{MAX_ATTEMPTS, ORDERS_EXPIRY, insert_opts};

/// One queue per job kind, named after the BullMQ queue it replaces.
pub const PAYMENT_EVENTS: &str = "payment-events";
pub const PUSH_NOTIFICATIONS: &str = "push-notifications";

/// How long a graceful stop waits for running jobs before cancelling them.
pub const SOFT_STOP_TIMEOUT: Duration = Duration::from_secs(30);

/// Jobs one queue runs at once.
const CONCURRENCY: usize = 5;

/// The queues this process drains, each at the same concurrency.
pub fn queues() -> [(&'static str, QueueConfig); 3] {
    [
        (ORDERS_EXPIRY, QueueConfig::new(CONCURRENCY)),
        (PAYMENT_EVENTS, QueueConfig::new(CONCURRENCY)),
        (PUSH_NOTIFICATIONS, QueueConfig::new(CONCURRENCY)),
    ]
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_ATTEMPTS, ORDERS_EXPIRY, PAYMENT_EVENTS, PUSH_NOTIFICATIONS, insert_opts, queues,
    };

    #[test]
    fn insert_defaults_carry_the_shared_retry_and_uniqueness() {
        let opts = insert_opts(ORDERS_EXPIRY);

        assert_eq!(opts.max_attempts(), Some(MAX_ATTEMPTS));
        assert_eq!(opts.queue(), Some(ORDERS_EXPIRY));
        assert!(opts.unique().is_some_and(|unique| unique.by_args()));
    }

    #[test]
    fn every_kind_has_its_own_queue() {
        let names: Vec<&str> = queues().iter().map(|(name, _)| *name).collect();

        assert_eq!(
            names,
            vec![ORDERS_EXPIRY, PAYMENT_EVENTS, PUSH_NOTIFICATIONS]
        );
    }
}
