//! profile subdomain DTOs, ported from the Bun contract.
//!
//! The onboarding survey is member-level: `MemberOnboarding` is unique on
//! `memberId`, so the same member reopening the form edits their answers instead
//! of creating a second row. `Onboarding` is the shape `session.current` already
//! returns, reused here so the dashboard reads one type.

use crate::tenant::session::{OnboardingPersona, OnboardingReferral, OnboardingSegment};

/// `v.strictObject({ persona, segment?, referral? })`.
///
/// The picklists are enforced by the enums: an unknown persona, segment or
/// referral fails deserialization before the handler runs.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveOnboardingInput {
    pub persona: OnboardingPersona,
    #[serde(default)]
    pub segment: Option<OnboardingSegment>,
    #[serde(default)]
    pub referral: Option<OnboardingReferral>,
}
