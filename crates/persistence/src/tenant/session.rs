//! Tenant dashboard session queries.
//!
//! Mirrors `apps/orpc-server/src/auth/session.ts` and the session support in
//! `packages/api-tenant`. `Member`, `Session` and `TenantMembership` are not
//! tenant-scoped models: the digest or the member id is the whole key, and a
//! member may belong to several tenants. The statements here are therefore the
//! member-level kind, with no `"tenantId"` bind.

use chrono::NaiveDateTime;
use sqlx::PgPool;

/// A `Session` row as stored. The id is the sha256 of the presented token.
pub struct SessionRow {
    pub id: String,
    pub member_id: String,
    pub namespace: String,
    pub expires_at: NaiveDateTime,
    pub last_used_at: NaiveDateTime,
    pub revoked_at: Option<NaiveDateTime>,
}

/// A `Member` row the session and account procedures read.
pub struct MemberRow {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub kind: String,
    pub password_hash: Option<String>,
}

/// One store the member belongs to, with the tenant's slug and display name.
pub struct MembershipRow {
    pub tenant_id: String,
    pub tenant_slug: String,
    pub tenant_name: String,
    pub role: String,
}

/// The member's stored onboarding answers.
pub struct OnboardingRow {
    pub persona: String,
    pub segment: Option<String>,
    pub referral: Option<String>,
}

/// A member to insert together with its first session.
pub struct NewMember {
    pub id: String,
    pub email: String,
    pub name: String,
    pub password_hash: String,
    pub birthdate: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// A session row to insert: the digest is the key, never the raw token.
pub struct NewSession {
    pub digest: String,
    pub member_id: String,
    pub namespace: String,
    pub expires_at: NaiveDateTime,
    pub last_used_at: NaiveDateTime,
}

/// Looks a session up by token digest.
///
/// `Session` carries no `"tenantId"`, so there is nothing to scope here: the
/// digest is the whole key, and the caller judges revocation and expiry.
pub async fn session_find(pool: &PgPool, digest: &str) -> Result<Option<SessionRow>, sqlx::Error> {
    type Row = (
        String,
        String,
        String,
        NaiveDateTime,
        NaiveDateTime,
        Option<NaiveDateTime>,
    );

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, "memberId", namespace, "expiresAt", "lastUsedAt", "revokedAt"
           FROM "Session"
           WHERE id = $1"#,
    )
    .bind(digest)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(
        |(id, member_id, namespace, expires_at, last_used_at, revoked_at)| SessionRow {
            id,
            member_id,
            namespace,
            expires_at,
            last_used_at,
            revoked_at,
        },
    ))
}

/// Slides a session's idle window forward.
///
/// `Session` has no tenant column, so the digest is the only key.
pub async fn session_touch(
    pool: &PgPool,
    digest: &str,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "Session" SET "lastUsedAt" = $2 WHERE id = $1"#)
        .bind(digest)
        .bind(now)
        .execute(pool)
        .await?;

    Ok(())
}

/// Inserts one session row keyed by the token digest.
pub async fn session_create(pool: &PgPool, session: &NewSession) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "Session" (id, "memberId", namespace, "expiresAt", "lastUsedAt")
           VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(&session.digest)
    .bind(&session.member_id)
    .bind(&session.namespace)
    .bind(session.expires_at)
    .bind(session.last_used_at)
    .execute(pool)
    .await?;

    Ok(())
}

/// Revokes the row with this digest; a missing row is a no-op, as in the TS.
pub async fn session_revoke(
    pool: &PgPool,
    digest: &str,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(r#"UPDATE "Session" SET "revokedAt" = $2 WHERE id = $1"#)
        .bind(digest)
        .bind(now)
        .execute(pool)
        .await?;

    Ok(())
}

/// The member with this e-mail address, or `None`.
pub async fn member_by_email(pool: &PgPool, email: &str) -> Result<Option<MemberRow>, sqlx::Error> {
    type Row = (String, String, Option<String>, String, Option<String>);

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, email, name, kind, "passwordHash" FROM "Member" WHERE email = $1"#,
    )
    .bind(email)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id, email, name, kind, password_hash)| MemberRow {
        id,
        email,
        name,
        kind,
        password_hash,
    }))
}

/// The member behind an id, or `None` when the row is gone.
pub async fn member_by_id(pool: &PgPool, id: &str) -> Result<Option<MemberRow>, sqlx::Error> {
    type Row = (String, String, Option<String>, String, Option<String>);

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, email, name, kind, "passwordHash" FROM "Member" WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(id, email, name, kind, password_hash)| MemberRow {
        id,
        email,
        name,
        kind,
        password_hash,
    }))
}

/// Memberships of a member, joined to the tenant's slug and display name. A
/// member spans tenants, so this is not a tenant-scoped statement.
pub async fn memberships_by_member(
    pool: &PgPool,
    member_id: &str,
) -> Result<Vec<MembershipRow>, sqlx::Error> {
    type Row = (String, String, String, String);

    let rows = sqlx::query_as::<_, Row>(
        r#"SELECT m."tenantId", t.slug, t."displayName", m.role
           FROM "TenantMembership" m
           JOIN "Tenant" t ON t.id = m."tenantId"
           WHERE m."memberId" = $1
           ORDER BY m."createdAt", m.id"#,
    )
    .bind(member_id)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(
            |(tenant_id, tenant_slug, tenant_name, role)| MembershipRow {
                tenant_id,
                tenant_slug,
                tenant_name,
                role,
            },
        )
        .collect())
}

/// The member's onboarding row, or `None` when the survey is unanswered.
pub async fn onboarding_by_member(
    pool: &PgPool,
    member_id: &str,
) -> Result<Option<OnboardingRow>, sqlx::Error> {
    type Row = (String, Option<String>, Option<String>);

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT persona, segment, referral FROM "MemberOnboarding" WHERE "memberId" = $1"#,
    )
    .bind(member_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|(persona, segment, referral)| OnboardingRow {
        persona,
        segment,
        referral,
    }))
}

/// Creates the `Member` and its first `Session` in one transaction, so a
/// half-registered account never exists. The caller has already normalized the
/// fields and hashed the password.
pub async fn register_member_with_session(
    pool: &PgPool,
    member: &NewMember,
    session: &NewSession,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"INSERT INTO "Member" (id, email, name, "passwordHash", birthdate, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6)"#,
    )
    .bind(&member.id)
    .bind(&member.email)
    .bind(&member.name)
    .bind(&member.password_hash)
    .bind(member.birthdate)
    .bind(member.updated_at)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"INSERT INTO "Session" (id, "memberId", namespace, "expiresAt", "lastUsedAt")
           VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(&session.digest)
    .bind(&session.member_id)
    .bind(&session.namespace)
    .bind(session.expires_at)
    .bind(session.last_used_at)
    .execute(&mut *tx)
    .await?;

    tx.commit().await
}
