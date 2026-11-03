//! Tenant scope for the SQL in this crate.
//!
//! Every tenant-scoped statement takes a `&TenantId` and binds it. `Scope`
//! exists so a caller has to name the exception before running cross-tenant
//! SQL, and so the reason lands in review instead of nowhere.

pub mod account;
pub mod internal;
pub mod membership;
pub mod panel;
pub mod profile;
pub mod public;
pub mod push;
pub mod session;

use std::str::FromStr;

/// Opaque tenant identifier.
///
/// `tenant_id` is a text column: ids are not UUIDs, so the shape is never
/// validated here.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TenantId(String);

impl TenantId {
    /// Trim surrounding whitespace and reject an empty id.
    pub fn parse(raw: &str) -> Result<Self, TenantIdError> {
        let trimmed = raw.trim();

        if trimmed.is_empty() {
            return Err(TenantIdError::Empty);
        }

        Ok(Self(trimmed.to_owned()))
    }

    /// The id as stored: trimmed, never empty.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Why a tenant id could not be built.
#[derive(Debug, thiserror::Error)]
pub enum TenantIdError {
    #[error("tenant id is empty")]
    Empty,
}

impl std::fmt::Display for TenantId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for TenantId {
    type Err = TenantIdError;

    fn from_str(raw: &str) -> Result<Self, Self::Err> {
        Self::parse(raw)
    }
}

impl AsRef<str> for TenantId {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

/// Which tenants a transaction may touch.
#[derive(Debug, Clone, Copy)]
pub enum Scope<'a> {
    Tenant(&'a TenantId),
    /// Only for host->tenant lookup and the worker scanning across tenants.
    Unscoped {
        reason: &'static str,
    },
}

impl<'a> Scope<'a> {
    pub fn tenant(id: &'a TenantId) -> Self {
        Self::Tenant(id)
    }

    /// Cross-tenant SQL needs a written reason; it shows up in review.
    ///
    /// # Panics
    ///
    /// Panics when the reason is empty or whitespace.
    pub fn unscoped(reason: &'static str) -> Self {
        assert!(
            !reason.trim().is_empty(),
            "unscoped SQL needs a reason, e.g. \"host lookup\""
        );

        Self::Unscoped { reason }
    }

    /// The tenant this scope is limited to, or `None` for an unscoped scope.
    pub fn tenant_id(&self) -> Option<&TenantId> {
        match self {
            Self::Tenant(id) => Some(id),
            Self::Unscoped { .. } => None,
        }
    }

    /// The tenant a scoped transaction needs.
    ///
    /// # Panics
    ///
    /// Panics for [`Scope::Unscoped`]: an unscoped scope can never become a
    /// tenant-scoped transaction.
    pub fn require_tenant(&self) -> &TenantId {
        self.tenant_id()
            .expect("a tenant-scoped transaction needs a tenant id, not Scope::unscoped")
    }
}

/// A transaction detached from the borrow of the pool.
pub type Tx = sqlx::Transaction<'static, sqlx::Postgres>;

/// A transaction that still knows the tenant it was opened for.
///
/// Returning a bare [`Tx`] dropped the scope the moment the caller used it. This
/// wrapper keeps the id attached, and its fields are private, so [`begin_scoped`]
/// is the only way to get one. `Deref`/`DerefMut` reach the statements on the
/// inner transaction; dropping without [`ScopedTx::commit`] rolls back, as with
/// sqlx.
pub struct ScopedTx {
    tenant: TenantId,
    tx: Tx,
}

impl ScopedTx {
    /// Wrap an open transaction with the tenant it belongs to.
    ///
    /// # Panics
    ///
    /// Panics when the scope names no tenant, so an unscoped transaction cannot
    /// be passed off as a scoped one.
    fn new(scope: Scope<'_>, tx: Tx) -> Self {
        Self {
            tenant: scope.require_tenant().clone(),
            tx,
        }
    }

    /// The tenant this transaction is limited to.
    pub fn tenant(&self) -> &TenantId {
        &self.tenant
    }

    /// Commit, consuming the wrapper so no scoped transaction outlives its scope.
    pub async fn commit(self) -> Result<(), sqlx::Error> {
        self.tx.commit().await
    }
}

impl std::ops::Deref for ScopedTx {
    type Target = Tx;

    fn deref(&self) -> &Self::Target {
        &self.tx
    }
}

impl std::ops::DerefMut for ScopedTx {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.tx
    }
}

/// Open a transaction for cross-tenant SQL.
///
/// Only for work that holds a [`Scope::Unscoped`] with a written reason (host
/// lookup, worker scans). Tenant statements use [`begin_scoped`] instead.
pub async fn begin(pool: &sqlx::PgPool) -> Result<Tx, sqlx::Error> {
    pool.begin().await
}

/// Open a transaction for one tenant.
///
/// The tenant id is a required argument and travels with the returned
/// [`ScopedTx`], so a tenant statement cannot be written without one. RLS is
/// deferred to a later ADR; the GUC is deliberately not set here, and setting it
/// is not a substitute for binding `tenant_id` in the statement.
pub async fn begin_scoped(pool: &sqlx::PgPool, tenant: &TenantId) -> Result<ScopedTx, sqlx::Error> {
    // sqlx::query("SET LOCAL app.tenant_id = $1")
    let tx = begin(pool).await?;

    Ok(ScopedTx::new(Scope::tenant(tenant), tx))
}
