//! profile subdomain queries, ported from the Bun onboarding handler.
//!
//! `MemberOnboarding` is member-level, not tenant-scoped: the unique `memberId`
//! is the whole key. The upsert edits the existing row in place, so reopening
//! the signup survey never creates a second answer set.

use chrono::NaiveDateTime;
use sqlx::PgPool;

/// Records the onboarding survey for a member, inserting once and editing on
/// every later visit. `id` is generated here; `createdAt` stays the column
/// default on insert and is untouched on conflict.
pub async fn onboarding_upsert(
    pool: &PgPool,
    member_id: &str,
    persona: &str,
    segment: Option<&str>,
    referral: Option<&str>,
    now: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO "MemberOnboarding"
               (id, "memberId", persona, segment, referral, "completedAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT ("memberId") DO UPDATE SET
               persona = EXCLUDED.persona,
               segment = EXCLUDED.segment,
               referral = EXCLUDED.referral,
               "completedAt" = EXCLUDED."completedAt",
               "updatedAt" = EXCLUDED."updatedAt""#,
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(member_id)
    .bind(persona)
    .bind(segment)
    .bind(referral)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}
