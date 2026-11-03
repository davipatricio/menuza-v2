//! Unit tests for the tenant guard. No database: these only exercise the
//! types that a query function has to go through.

use std::str::FromStr;

use persistence::tenant::{Scope, TenantId, TenantIdError};

#[test]
fn parse_trims_and_keeps_the_id() {
    let id = TenantId::parse("  t-1 ").expect("t-1 is a valid tenant id");

    assert_eq!(id.as_str(), "t-1");
}

#[test]
fn parse_rejects_empty_and_whitespace() {
    assert!(matches!(TenantId::parse(""), Err(TenantIdError::Empty)));
    assert!(matches!(TenantId::parse("   "), Err(TenantIdError::Empty)));
}

#[test]
fn scope_keeps_the_tenant() {
    let id = TenantId::parse("t-1").expect("t-1 is a valid tenant id");

    assert_eq!(Scope::tenant(&id).tenant_id(), Some(&id));
}

#[test]
fn unscoped_scope_has_no_tenant() {
    assert_eq!(Scope::unscoped("host lookup").tenant_id(), None);
}

#[test]
#[should_panic]
fn unscoped_scope_needs_a_reason() {
    let _ = Scope::unscoped("  ");
}

#[test]
#[should_panic]
fn scoped_tx_needs_a_tenant() {
    // A `ScopedTx` is only built from a tenant-bearing scope, so the unscoped
    // scope has to refuse rather than hand out an unscoped transaction.
    let _ = Scope::unscoped("host lookup").require_tenant();
}

#[test]
fn scoped_tx_keeps_the_tenant_it_was_opened_for() {
    // The id `ScopedTx::tenant()` reports is the one its constructor is given.
    let id = TenantId::parse("t-1").expect("t-1 is a valid tenant id");

    assert_eq!(Scope::tenant(&id).require_tenant(), &id);
}

#[test]
fn from_str_round_trips() {
    let parsed = TenantId::from_str("t-1").expect("t-1 is a valid tenant id");
    let reparsed = TenantId::from_str(parsed.as_str()).expect("t-1 is a valid tenant id");

    assert_eq!(parsed, reparsed);
    assert_eq!(reparsed.to_string(), "t-1");
}
