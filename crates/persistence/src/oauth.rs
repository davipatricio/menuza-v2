//! OAuth client, authorization-code and access-token queries.
//!
//! Mirrors `apps/orpc-server/src/auth/oauth.ts`. None of the three tables is
//! tenant-scoped: a client is registered globally and a code or token carries
//! the `tenantIds` array it was granted. The keys are the client id and the
//! SHA-256 hex digests, so these are member-level statements like the session
//! ones, not `Scope` statements.

use chrono::NaiveDateTime;
use sqlx::PgPool;

/// A registered client, with the redirect URIs it may deliver codes to.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OAuthClientRow {
    pub client_id: String,
    pub redirect_uris: Vec<String>,
}

/// A live authorization code, keyed by the digest of the raw code.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OAuthCodeRow {
    pub id: String,
    pub client_id: String,
    pub member_id: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    pub tenant_ids: Vec<String>,
    pub expires_at: NaiveDateTime,
}

/// An authorization code to insert; the digest is the lookup key, never the
/// raw code.
pub struct NewOAuthCode {
    pub id: String,
    pub code_hash: String,
    pub client_id: String,
    pub member_id: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
    pub redirect_uri: String,
    pub scopes: Vec<String>,
    pub tenant_ids: Vec<String>,
    pub expires_at: NaiveDateTime,
}

/// An access token to insert; again the digest is what is stored.
pub struct NewOAuthToken {
    pub id: String,
    pub access_token_hash: String,
    pub client_id: String,
    pub member_id: String,
    pub scopes: Vec<String>,
    pub tenant_ids: Vec<String>,
    pub expires_at: NaiveDateTime,
}

/// The client behind an id, or `None` when it was never registered.
pub async fn oauth_client_find(
    pool: &PgPool,
    client_id: &str,
) -> Result<Option<OAuthClientRow>, sqlx::Error> {
    sqlx::query_as::<_, OAuthClientRow>(
        r#"SELECT "clientId" AS client_id, "redirectUris" AS redirect_uris
           FROM "OAuthClient"
           WHERE "clientId" = $1"#,
    )
    .bind(client_id)
    .fetch_optional(pool)
    .await
}

/// The authorization code with this digest, or `None`.
pub async fn oauth_code_find(
    pool: &PgPool,
    code_hash: &str,
) -> Result<Option<OAuthCodeRow>, sqlx::Error> {
    sqlx::query_as::<_, OAuthCodeRow>(
        r#"SELECT id, "clientId" AS client_id, "memberId" AS member_id,
                  "codeChallenge" AS code_challenge,
                  "codeChallengeMethod" AS code_challenge_method,
                  "redirectUri" AS redirect_uri, scopes,
                  "tenantIds" AS tenant_ids, "expiresAt" AS expires_at
           FROM "OAuthAuthCode"
           WHERE "codeHash" = $1"#,
    )
    .bind(code_hash)
    .fetch_optional(pool)
    .await
}

/// Inserts one authorization code row.
pub async fn oauth_code_insert(pool: &PgPool, code: &NewOAuthCode) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OAuthAuthCode"
               (id, "codeHash", "clientId", "memberId", "codeChallenge",
                "codeChallengeMethod", "redirectUri", scopes, "tenantIds", "expiresAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"#,
    )
    .bind(&code.id)
    .bind(&code.code_hash)
    .bind(&code.client_id)
    .bind(&code.member_id)
    .bind(&code.code_challenge)
    .bind(&code.code_challenge_method)
    .bind(&code.redirect_uri)
    .bind(&code.scopes)
    .bind(&code.tenant_ids)
    .bind(code.expires_at)
    .execute(pool)
    .await?;

    Ok(())
}

/// Deletes the code and reports whether this call was the one that removed it.
///
/// The row count is the compare-and-swap that makes a code single-use: two
/// overlapping exchanges can both pass the checks, but only one deletes the
/// row, so only one mints a token.
pub async fn oauth_code_consume(pool: &PgPool, id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(r#"DELETE FROM "OAuthAuthCode" WHERE id = $1"#)
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() == 1)
}

/// Inserts one access token row.
pub async fn oauth_token_insert(pool: &PgPool, token: &NewOAuthToken) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "OAuthToken"
               (id, "accessTokenHash", "clientId", "memberId", scopes, "tenantIds", "expiresAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
    )
    .bind(&token.id)
    .bind(&token.access_token_hash)
    .bind(&token.client_id)
    .bind(&token.member_id)
    .bind(&token.scopes)
    .bind(&token.tenant_ids)
    .bind(token.expires_at)
    .execute(pool)
    .await?;

    Ok(())
}

/// Marks the token with this digest revoked. A missing row is a no-op, and the
/// answer says whether one was updated.
pub async fn oauth_token_revoke(
    pool: &PgPool,
    access_token_hash: &str,
    now: NaiveDateTime,
) -> Result<bool, sqlx::Error> {
    let result =
        sqlx::query(r#"UPDATE "OAuthToken" SET "revokedAt" = $2 WHERE "accessTokenHash" = $1"#)
            .bind(access_token_hash)
            .bind(now)
            .execute(pool)
            .await?;

    Ok(result.rows_affected() > 0)
}
