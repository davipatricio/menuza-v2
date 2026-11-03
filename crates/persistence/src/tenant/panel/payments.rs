//! payments resource queries, ported from the Bun panel support.
//!
//! Two rules run through the module:
//!
//! 1. **The secret goes in and never comes out.** The stored `credentials`
//!    column is an AES-256-GCM envelope (`v1.<iv>.<tag>.<ciphertext>`, base64
//!    parts); the panel only ever reads [`PaymentIntegrationRow::has_credentials`],
//!    and the plaintext is decoded for the commerce adapter alone.
//! 2. **An integration id is a hint, not a grant.** Every statement binds
//!    `tenantId`, so an id from another store resolves to nothing and the caller
//!    answers the same `NOT_FOUND` as an unknown id.
//!
//! One row per `(tenantId, method)` is the whole routing rule: a method has a
//! provider, and there is no fallback between providers of the same method.

use aes_gcm::aead::{Aead, Generate, Key, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine as _;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_PAD_INDIFFERENT};
use chrono::NaiveDateTime;
use sqlx::PgPool;

use super::super::TenantId;
use crate::tenant::begin_scoped;

/// The environment variable holding the base64url-encoded 32-byte master key.
pub const INTEGRATION_SECRET_KEY_ENV: &str = "INTEGRATION_SECRET_KEY";

/// Envelope prefix; a rotation adds `v2` instead of rewriting every row.
const ENVELOPE_VERSION: &str = "v1";

/// AES-256 key length.
const KEY_BYTES: usize = 32;

/// 96-bit GCM nonce, the size the TS envelope writes.
const IV_BYTES: usize = 12;

/// GCM authentication tag length.
const TAG_BYTES: usize = 16;

/// Why a credential could not be sealed, opened or read.
#[derive(Debug, thiserror::Error)]
pub enum SecretError {
    #[error("{0} is not set; integration credentials cannot be stored")]
    MissingKey(&'static str),
    #[error("{0} must decode to 32 bytes (base64url)")]
    InvalidKey(&'static str),
    #[error("malformed secret envelope")]
    Malformed,
    #[error("secret envelope could not be encrypted")]
    Encrypt,
    #[error("secret envelope could not be decrypted")]
    Decrypt,
    #[error("integration credentials could not be read")]
    Database(#[from] sqlx::Error),
}

/// Why an assignment could not be written.
#[derive(Debug, thiserror::Error)]
pub enum AssignmentError {
    /// The integration row exists but does not belong to this tenant, so the
    /// statement inserted nothing. A cross-store id is the same answer as an
    /// unknown one, but it is a separate arm because nothing was written.
    #[error("integration {0} does not belong to this tenant")]
    ForeignIntegration(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

/// What a delete did, so the caller answers `200`, `409` or `404` from one
/// transaction instead of a second query.
#[derive(Debug, PartialEq, Eq)]
pub enum PaymentIntegrationRemoval {
    Removed,
    /// A payment method still points at it; the row is kept.
    Assigned,
    Missing,
}

/// One gateway connection, with the credential reduced to its presence.
pub struct PaymentIntegrationRow {
    pub id: String,
    pub provider: String,
    pub label: String,
    pub status: String,
    pub webhook_token: String,
    /// `credentials IS NOT NULL`; the envelope itself is not selected.
    pub has_credentials: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Which integration answers one payment method, joined to its label.
pub struct PaymentAssignmentRow {
    pub method: String,
    pub integration_id: String,
    pub provider: String,
    pub label: String,
}

/// The store's integrations, oldest first.
pub async fn payment_integration_list(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<PaymentIntegrationRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        String,
        String,
        bool,
        NaiveDateTime,
        NaiveDateTime,
    );

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT id, provider, label, status, "webhookToken",
                  credentials IS NOT NULL AS has_credentials,
                  "createdAt", "updatedAt"
             FROM "PaymentIntegration"
            WHERE "tenantId" = $1
            ORDER BY "createdAt" ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(
                id,
                provider,
                label,
                status,
                webhook_token,
                has_credentials,
                created_at,
                updated_at,
            )| {
                PaymentIntegrationRow {
                    id,
                    provider,
                    label,
                    status,
                    webhook_token,
                    has_credentials,
                    created_at,
                    updated_at,
                }
            },
        )
        .collect())
}

/// One integration, scoped to the store.
pub async fn payment_integration_find(
    pool: &PgPool,
    tenant: &TenantId,
    integration_id: &str,
) -> Result<Option<PaymentIntegrationRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        String,
        String,
        bool,
        NaiveDateTime,
        NaiveDateTime,
    );

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, provider, label, status, "webhookToken",
                  credentials IS NOT NULL AS has_credentials,
                  "createdAt", "updatedAt"
             FROM "PaymentIntegration"
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(integration_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(id, provider, label, status, webhook_token, has_credentials, created_at, updated_at)| {
            PaymentIntegrationRow {
                id,
                provider,
                label,
                status,
                webhook_token,
                has_credentials,
                created_at,
                updated_at,
            }
        },
    ))
}

/// Inserts the connection and answers its new id. `credentials` is already the
/// envelope, or `None` for a provider that needs no secret.
pub async fn payment_integration_create(
    pool: &PgPool,
    tenant: &TenantId,
    provider: &str,
    label: &str,
    credentials: Option<&str>,
    webhook_token: &str,
    now: NaiveDateTime,
) -> Result<String, sqlx::Error> {
    let integration_id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        r#"INSERT INTO "PaymentIntegration"
               (id, "tenantId", provider, label, status, credentials, "webhookToken",
                "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $7)"#,
    )
    .bind(&integration_id)
    .bind(tenant.as_str())
    .bind(provider)
    .bind(label)
    .bind(credentials)
    .bind(webhook_token)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(integration_id)
}

/// Replaces the label and, when a new secret arrived, the credential. `None`
/// keeps the stored envelope, which is what lets the store rename without
/// re-typing the key.
pub async fn payment_integration_update(
    pool: &PgPool,
    tenant: &TenantId,
    integration_id: &str,
    label: &str,
    credentials: Option<&str>,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let updated = sqlx::query(
        r#"UPDATE "PaymentIntegration"
              SET label = $3,
                  credentials = COALESCE($4, credentials),
                  "updatedAt" = $5
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(integration_id)
    .bind(label)
    .bind(credentials)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(updated.rows_affected() > 0)
}

/// Deletes the connection unless a payment method still points at it.
///
/// The guard and the delete are one transaction, and the integration row is
/// locked first: a concurrent assignment insert waits on that lock, so it
/// cannot slip between the count and the `DELETE` that would cascade it away.
pub async fn payment_integration_delete(
    pool: &PgPool,
    tenant: &TenantId,
    integration_id: &str,
) -> Result<PaymentIntegrationRemoval, sqlx::Error> {
    let mut tx = begin_scoped(pool, tenant).await?;

    let found = sqlx::query_scalar::<_, String>(
        r#"SELECT id
             FROM "PaymentIntegration"
            WHERE "tenantId" = $1 AND id = $2
            FOR UPDATE"#,
    )
    .bind(tenant.as_str())
    .bind(integration_id)
    .fetch_optional(&mut **tx)
    .await?;

    if found.is_none() {
        return Ok(PaymentIntegrationRemoval::Missing);
    }

    let assigned = sqlx::query_scalar::<_, i64>(
        r#"SELECT count(*)::bigint
             FROM "PaymentMethodAssignment"
            WHERE "tenantId" = $1 AND "integrationId" = $2"#,
    )
    .bind(tenant.as_str())
    .bind(integration_id)
    .fetch_one(&mut **tx)
    .await?;

    if assigned > 0 {
        return Ok(PaymentIntegrationRemoval::Assigned);
    }

    sqlx::query(r#"DELETE FROM "PaymentIntegration" WHERE "tenantId" = $1 AND id = $2"#)
        .bind(tenant.as_str())
        .bind(integration_id)
        .execute(&mut **tx)
        .await?;

    tx.commit().await?;

    Ok(PaymentIntegrationRemoval::Removed)
}

/// Every assignment, ordered by method, with the label the panel renders.
pub async fn payment_assignment_list(
    pool: &PgPool,
    tenant: &TenantId,
) -> Result<Vec<PaymentAssignmentRow>, sqlx::Error> {
    let rows = sqlx::query_as::<_, (String, String, String, String)>(
        r#"SELECT a.method, i.id, i.provider, i.label
             FROM "PaymentMethodAssignment" a
             JOIN "PaymentIntegration" i
               ON i.id = a."integrationId" AND i."tenantId" = a."tenantId"
            WHERE a."tenantId" = $1
            ORDER BY a.method ASC"#,
    )
    .bind(tenant.as_str())
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(method, integration_id, provider, label)| PaymentAssignmentRow {
                method,
                integration_id,
                provider,
                label,
            },
        )
        .collect())
}

/// Clears the method: it is no longer offered.
pub async fn payment_assignment_clear(
    pool: &PgPool,
    tenant: &TenantId,
    method: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"DELETE FROM "PaymentMethodAssignment" WHERE "tenantId" = $1 AND method = $2"#)
        .bind(tenant.as_str())
        .bind(method)
        .execute(pool)
        .await?;

    Ok(())
}

/// Upserts on the unique `(tenantId, method)`, so two admin tabs cannot leave
/// the method with two answers.
///
/// The row set comes from the integration itself, so an id from another store
/// inserts nothing and answers [`AssignmentError::ForeignIntegration`] instead
/// of pointing this store's method at a connection it cannot read.
pub async fn payment_assignment_save(
    pool: &PgPool,
    tenant: &TenantId,
    method: &str,
    integration_id: &str,
    now: NaiveDateTime,
) -> Result<(), AssignmentError> {
    let saved = sqlx::query(
        r#"INSERT INTO "PaymentMethodAssignment"
               (id, "tenantId", method, "integrationId", "createdAt", "updatedAt")
           SELECT $1, $2, $3, i.id, $5, $5
             FROM "PaymentIntegration" i
            WHERE i."tenantId" = $2 AND i.id = $4
           ON CONFLICT ("tenantId", method)
           DO UPDATE SET "integrationId" = EXCLUDED."integrationId",
                         "updatedAt" = EXCLUDED."updatedAt""#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(tenant.as_str())
    .bind(method)
    .bind(integration_id)
    .bind(now)
    .execute(pool)
    .await?;

    if saved.rows_affected() == 0 {
        return Err(AssignmentError::ForeignIntegration(
            integration_id.to_owned(),
        ));
    }

    Ok(())
}

/// The decrypted credential blob, or `None` when the integration stores none.
///
/// This is the only read that opens the envelope; the panel never calls it.
pub async fn payment_integration_credentials(
    pool: &PgPool,
    tenant: &TenantId,
    integration_id: &str,
) -> Result<Option<String>, SecretError> {
    let row = sqlx::query_as::<_, (Option<String>,)>(
        r#"SELECT credentials
             FROM "PaymentIntegration"
            WHERE "tenantId" = $1 AND id = $2"#,
    )
    .bind(tenant.as_str())
    .bind(integration_id)
    .fetch_optional(pool)
    .await?;

    let Some((credentials,)) = row else {
        return Ok(None);
    };

    credentials.as_deref().map(decrypt_secret).transpose()
}

/// The master key, read on every call so a rotation needs no restart.
pub fn integration_secret_key() -> Result<[u8; KEY_BYTES], SecretError> {
    let raw = std::env::var(INTEGRATION_SECRET_KEY_ENV).unwrap_or_default();

    if raw.is_empty() {
        return Err(SecretError::MissingKey(INTEGRATION_SECRET_KEY_ENV));
    }

    let bytes = URL_SAFE_PAD_INDIFFERENT
        .decode(&raw)
        .map_err(|_| SecretError::InvalidKey(INTEGRATION_SECRET_KEY_ENV))?;

    bytes
        .try_into()
        .map_err(|_| SecretError::InvalidKey(INTEGRATION_SECRET_KEY_ENV))
}

/// `v1.<iv-b64>.<tag-b64>.<ciphertext-b64>`, with a random 96-bit IV.
pub fn encrypt_secret(plaintext: &str) -> Result<String, SecretError> {
    let key = integration_secret_key()?;
    let iv: [u8; IV_BYTES] = Generate::generate();

    seal(plaintext, &key, &iv)
}

/// The same envelope with a caller-supplied IV, for the fixed-vector test.
pub fn encrypt_secret_with(
    plaintext: &str,
    key: &[u8; KEY_BYTES],
    iv: &[u8; IV_BYTES],
) -> Result<String, SecretError> {
    seal(plaintext, key, iv)
}

/// Opens an envelope with the process key.
pub fn decrypt_secret(envelope: &str) -> Result<String, SecretError> {
    decrypt_secret_with(envelope, &integration_secret_key()?)
}

/// Opens an envelope with an explicit key.
pub fn decrypt_secret_with(envelope: &str, key: &[u8; KEY_BYTES]) -> Result<String, SecretError> {
    let mut parts = envelope.split('.');
    let version = parts.next().ok_or(SecretError::Malformed)?;
    let iv = parts.next().ok_or(SecretError::Malformed)?;
    let tag = parts.next().ok_or(SecretError::Malformed)?;
    let ciphertext = parts.next().ok_or(SecretError::Malformed)?;

    if version != ENVELOPE_VERSION || parts.next().is_some() {
        return Err(SecretError::Malformed);
    }

    let iv: [u8; IV_BYTES] = STANDARD
        .decode(iv)
        .map_err(|_| SecretError::Malformed)?
        .try_into()
        .map_err(|_| SecretError::Malformed)?;

    let tag = STANDARD.decode(tag).map_err(|_| SecretError::Malformed)?;

    if tag.len() != TAG_BYTES {
        return Err(SecretError::Malformed);
    }

    let mut sealed = STANDARD
        .decode(ciphertext)
        .map_err(|_| SecretError::Malformed)?;

    sealed.extend_from_slice(&tag);

    let plaintext = Aes256Gcm::new(&Key::<Aes256Gcm>::from(*key))
        .decrypt(&Nonce::from(iv), sealed.as_ref())
        .map_err(|_| SecretError::Decrypt)?;

    String::from_utf8(plaintext).map_err(|_| SecretError::Decrypt)
}

/// Seals the plaintext and lays the parts out in the TS envelope order.
fn seal(
    plaintext: &str,
    key: &[u8; KEY_BYTES],
    iv: &[u8; IV_BYTES],
) -> Result<String, SecretError> {
    let sealed = Aes256Gcm::new(&Key::<Aes256Gcm>::from(*key))
        .encrypt(&Nonce::from(*iv), plaintext.as_bytes())
        .map_err(|_| SecretError::Encrypt)?;

    let (ciphertext, tag) = sealed.split_at(sealed.len() - TAG_BYTES);

    Ok(format!(
        "{ENVELOPE_VERSION}.{}.{}.{}",
        STANDARD.encode(iv),
        STANDARD.encode(tag),
        STANDARD.encode(ciphertext)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Bytes 0..=31, the key `AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8` in base64url.
    const KEY: [u8; KEY_BYTES] = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
        25, 26, 27, 28, 29, 30, 31,
    ];

    /// Bytes 1..=12, a fixed nonce so the test can pin the exact envelope.
    const IV: [u8; IV_BYTES] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    const PLAINTEXT: &str = r#"{"secretKey":"sk_test_123"}"#;

    /// Produced by `apps/orpc-server/src/crypto/secrets.ts` (Node `aes-256-gcm`)
    /// with this key, this IV and this plaintext.
    const TS_ENVELOPE: &str =
        "v1.AQIDBAUGBwgJCgsM.f+T4bwVnIBQlwKAm8jKFAQ==.fsgpsI/mlfIHxxplKjGZQx03hI3jMmH3kn2E";

    #[test]
    fn envelope_matches_the_ts_layout() {
        assert_eq!(
            encrypt_secret_with(PLAINTEXT, &KEY, &IV).expect("seal"),
            TS_ENVELOPE
        );
        assert_eq!(
            decrypt_secret_with(TS_ENVELOPE, &KEY).expect("open"),
            PLAINTEXT
        );
    }

    #[test]
    fn envelope_with_a_foreign_key_is_refused() {
        let mut other = KEY;
        other[0] = 0xff;

        assert!(matches!(
            decrypt_secret_with(TS_ENVELOPE, &other),
            Err(SecretError::Decrypt)
        ));
    }

    #[test]
    fn envelope_with_a_bad_version_or_part_count_is_malformed() {
        let wrong_version = TS_ENVELOPE.replacen("v1.", "v2.", 1);
        let missing_part = "v1.AQIDBAUGBwgJCgsM.f+T4bwVnIBQlwKAm8jKFAQ==";

        assert!(matches!(
            decrypt_secret_with(&wrong_version, &KEY),
            Err(SecretError::Malformed)
        ));
        assert!(matches!(
            decrypt_secret_with(missing_part, &KEY),
            Err(SecretError::Malformed)
        ));
    }

    // The checks below run against `DATABASE_URL` and skip when it is unset, so
    // the crate's default `cargo test` still needs no infrastructure.

    /// Runs one check on a current-thread runtime with the pool it opened.
    ///
    /// `sqlx` exports the block-on its own test macro uses, so no extra
    /// dependency is needed. The pool and its statements share one runtime on
    /// purpose: a pool outlives the runtime that built it, and its connections
    /// come back closed.
    fn with_database<F, Fut>(check: F)
    where
        F: FnOnce(PgPool) -> Fut,
        Fut: std::future::Future<Output = ()>,
    {
        let Ok(url) = std::env::var("DATABASE_URL") else {
            return;
        };

        sqlx::test_block_on(async move {
            let pool = PgPool::connect(&url)
                .await
                .expect("the test database connects");

            check(pool).await;
        });
    }

    fn now() -> NaiveDateTime {
        chrono::Utc::now().naive_utc()
    }

    /// A throwaway tenant; the id is unique so a repeat run never collides.
    async fn new_tenant(pool: &PgPool) -> TenantId {
        let id = format!("t-{}", uuid::Uuid::new_v4());

        sqlx::query(
            r#"INSERT INTO "Tenant" (id, slug, "displayName", "updatedAt")
               VALUES ($1, $1, $1, now())"#,
        )
        .bind(&id)
        .execute(pool)
        .await
        .expect("insert tenant");

        TenantId::parse(&id).expect("the id is not empty")
    }

    async fn drop_tenant(pool: &PgPool, tenant: &TenantId) {
        sqlx::query(r#"DELETE FROM "Tenant" WHERE id = $1"#)
            .bind(tenant.as_str())
            .execute(pool)
            .await
            .expect("delete tenant");
    }

    /// An `offline` integration, which needs no secret, owned by `tenant`.
    async fn new_integration(pool: &PgPool, tenant: &TenantId) -> String {
        payment_integration_create(
            pool,
            tenant,
            "offline",
            "Balcão",
            None,
            &uuid::Uuid::new_v4().to_string(),
            now(),
        )
        .await
        .expect("insert integration")
    }

    async fn assignment_count(pool: &PgPool, tenant: &TenantId) -> i64 {
        sqlx::query_scalar::<_, i64>(
            r#"SELECT count(*)::bigint
                 FROM "PaymentMethodAssignment"
                WHERE "tenantId" = $1"#,
        )
        .bind(tenant.as_str())
        .fetch_one(pool)
        .await
        .expect("count assignments")
    }

    #[test]
    fn an_assignment_refuses_another_stores_integration() {
        with_database(|pool| async move {
            let owner = new_tenant(&pool).await;
            let other = new_tenant(&pool).await;
            let integration_id = new_integration(&pool, &owner).await;

            let refused =
                payment_assignment_save(&pool, &other, "pix", &integration_id, now()).await;

            assert!(
                matches!(
                    refused,
                    Err(AssignmentError::ForeignIntegration(ref id)) if id == &integration_id
                ),
                "an integration from another store is a distinct refusal"
            );
            assert_eq!(
                assignment_count(&pool, &other).await,
                0,
                "the refused statement writes nothing for the other store"
            );

            payment_assignment_save(&pool, &owner, "pix", &integration_id, now())
                .await
                .expect("the owner still points its own method at its own integration");
            assert_eq!(assignment_count(&pool, &owner).await, 1);

            drop_tenant(&pool, &owner).await;
            drop_tenant(&pool, &other).await;
        });
    }

    #[test]
    fn deleting_a_connected_integration_keeps_the_assignment() {
        with_database(|pool| async move {
            let tenant = new_tenant(&pool).await;
            let integration_id = new_integration(&pool, &tenant).await;

            payment_assignment_save(&pool, &tenant, "pix", &integration_id, now())
                .await
                .expect("assign the method");

            assert_eq!(
                payment_integration_delete(&pool, &tenant, &integration_id)
                    .await
                    .expect("the guard and the delete run in one transaction"),
                PaymentIntegrationRemoval::Assigned
            );
            assert_eq!(
                assignment_count(&pool, &tenant).await,
                1,
                "the refused delete did not cascade the assignment away"
            );

            payment_assignment_clear(&pool, &tenant, "pix")
                .await
                .expect("clear the method");

            assert_eq!(
                payment_integration_delete(&pool, &tenant, &integration_id)
                    .await
                    .expect("delete the unassigned integration"),
                PaymentIntegrationRemoval::Removed
            );
            assert_eq!(
                payment_integration_delete(&pool, &tenant, &integration_id)
                    .await
                    .expect("a second delete finds nothing"),
                PaymentIntegrationRemoval::Missing
            );

            drop_tenant(&pool, &tenant).await;
        });
    }
}
