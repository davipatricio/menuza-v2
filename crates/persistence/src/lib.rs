//! Persistence layer for the Rust services.
//!
//! Every SQL statement in the workspace lives in this crate. Handlers and the
//! domain layer receive typed structs and never see a `PgRow`. Tenant-scoped
//! reads and writes always take `tenant_id` as a bind parameter (ADR-0001);
//! `unscoped` is an explicit, auditable exception.
//!
//! The migration baseline is `migrations/0001_baseline.sql`, the Prisma-era
//! schema frozen at cutover. It is applied by the deploy step (`sqlx migrate
//! run`), never on boot. Existing databases are marked as applied before the
//! first Rust write; see ADR-0007. The set is append-only: sqlx refuses to run
//! once an applied file's checksum changes.

pub mod commerce;
pub mod jobs;
pub mod mcp;
pub mod oauth;
pub mod tenant;

/// Embedded migration set: the baseline, then River's job tables. Append new
/// files, never edit an applied one.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[cfg(test)]
mod tests {
    use super::MIGRATOR;

    #[test]
    fn baseline_then_river_jobs() {
        let versions: Vec<i64> = MIGRATOR.iter().map(|migration| migration.version).collect();

        assert_eq!(versions, vec![1, 2]);
    }
}
