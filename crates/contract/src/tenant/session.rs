//! session subdomain DTOs, ported from the Bun contract.
//!
//! The dashboard's bearer session lives in the `menuza_tenant_sid` cookie; the
//! output of login, registration and `current` is the member plus the stores
//! the member belongs to. Field names, nullability and validation gates are the
//! ones `packages/shared/src/panel/contracts.ts` declared, so a client already
//! reading that shape needs no change.

use chrono::{Datelike, NaiveDate, Utc};

use crate::ErrorCode;

/// `Member.kind` narrowed to the closed set.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum MemberKind {
    Human,
    Bot,
}

/// A `TenantMembership.role` narrowed to the closed set.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum TenantRole {
    Owner,
    Admin,
    Staff,
}

/// The signup survey's first answer.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingPersona {
    Owner,
    Staff,
    Exploring,
    Partner,
}

/// The optional second onboarding answer.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingSegment {
    Restaurant,
    Snack,
    Market,
    Sweets,
    Other,
}

/// The optional "how did you hear about us" answer.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingReferral {
    Referral,
    Instagram,
    Google,
    Other,
}

/// The authenticated member, as the session payload carries it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionMember {
    pub id: String,
    pub email: String,
    #[schema(required)]
    pub name: Option<String>,
    pub kind: MemberKind,
}

/// One store the member may open in the dashboard.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionMembership {
    pub tenant_id: String,
    pub tenant_slug: String,
    pub tenant_name: String,
    pub role: TenantRole,
}

/// The member's onboarding answers, or `null` when unanswered.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Onboarding {
    pub persona: OnboardingPersona,
    #[schema(required)]
    pub segment: Option<OnboardingSegment>,
    #[schema(required)]
    pub referral: Option<OnboardingReferral>,
}

/// `v.strictObject({ email, password })`, with its own gates.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginInput {
    pub email: String,
    pub password: String,
}

impl LoginInput {
    /// `email: nonEmpty + email + maxLength(254)`,
    /// `password: nonEmpty + maxLength(200)`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        let email = self.email.trim();

        if email.is_empty() || email.chars().count() > 254 || !is_email(email) {
            return Err(ErrorCode::ValidationFailed);
        }

        if self.password.is_empty() || self.password.chars().count() > 200 {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `v.strictObject({ name, email, birthdate, password })`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegisterInput {
    pub name: String,
    pub email: String,
    pub birthdate: String,
    pub password: String,
}

impl RegisterInput {
    /// The registration gates, including the 18-year minimum. Uses today (UTC)
    /// for the age check; [`Self::validate_at`] keeps that injectable.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        self.validate_at(Utc::now().date_naive())
    }

    /// The same gates with the age check pinned to `today`.
    pub fn validate_at(&self, today: NaiveDate) -> Result<(), ErrorCode> {
        let name = self.name.trim();
        let name_length = name.chars().count();

        if !(2..=120).contains(&name_length) {
            return Err(ErrorCode::ValidationFailed);
        }

        let email = self.email.trim();

        if email.chars().count() > 254 || !is_email(email) {
            return Err(ErrorCode::ValidationFailed);
        }

        let birthdate = NaiveDate::parse_from_str(&self.birthdate, "%Y-%m-%d")
            .map_err(|_| ErrorCode::ValidationFailed)?;

        if !is_adult(birthdate, today) {
            return Err(ErrorCode::ValidationFailed);
        }

        if !(8..=200).contains(&self.password.chars().count()) {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }

    /// The normalized name the handler stores (`v.trim()`).
    pub fn normalized_name(&self) -> &str {
        self.name.trim()
    }

    /// The normalized e-mail the handler stores (`v.trim()` + `v.toLowerCase()`).
    pub fn normalized_email(&self) -> String {
        self.email.trim().to_lowercase()
    }

    /// The birthdate the handler stores: local midnight, matching
    /// `Temporal.PlainDateTime.from(\`${birthdate}T00:00:00\`)`.
    pub fn birthdate_at_midnight(&self) -> Option<chrono::NaiveDateTime> {
        NaiveDate::parse_from_str(&self.birthdate, "%Y-%m-%d")
            .ok()?
            .and_hms_opt(0, 0, 0)
    }

    /// The normalized e-mail a login also uses.
    pub fn normalized_login_email(&self) -> String {
        self.email.trim().to_lowercase()
    }
}

/// `{ member, memberships }` — the login and registration answer.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoginOutput {
    pub member: SessionMember,
    pub memberships: Vec<SessionMembership>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LogoutOutput {
    pub success: bool,
}

/// `{ member, memberships, onboarding }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CurrentOutput {
    pub member: SessionMember,
    pub memberships: Vec<SessionMembership>,
    #[schema(required)]
    pub onboarding: Option<Onboarding>,
}

/// A pragmatic e-mail gate: the `v.email()` check is the local part and the
/// domain, without whitespace or a second `@`. A malformed address is
/// `VALIDATION_FAILED`, never a database lookup.
fn is_email(value: &str) -> bool {
    if value.is_empty() || value.chars().any(char::is_whitespace) {
        return false;
    }

    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };

    !local.is_empty() && !domain.is_empty() && !domain.contains('@')
}

/// The contract's 18-year gate, evaluated in UTC like the Bun handler.
fn is_adult(birthdate: NaiveDate, today: NaiveDate) -> bool {
    let birthday_passed = (today.month(), today.day()) >= (birthdate.month(), birthdate.day());

    today.year() - birthdate.year() - i32::from(!birthday_passed) >= 18
}
