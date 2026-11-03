//! `POST /profile/onboarding` — record or edit the signup survey.
//!
//! Upserts on the unique `memberId`, so a member who reopens
//! `/dashboard/signup/perfil` edits their answers instead of creating a second
//! row. An unanswered optional is stored as NULL.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use chrono::Utc;
use contract::tenant::profile::SaveOnboardingInput;
use contract::tenant::session::{
    Onboarding, OnboardingPersona, OnboardingReferral, OnboardingSegment,
};
use domain::session::{is_same_origin, public_host};
use menuza_http::extract::SessionToken;
use persistence::tenant::profile::onboarding_upsert;

use crate::domains::tenant::support::{ApiError, db_error, require_member};

#[utoipa::path(
    post,
    path = "/profile/onboarding",
    operation_id = "savePanelOnboarding",
    tag = "profile",
    request_body = SaveOnboardingInput,
    responses(
        (status = 200, body = Onboarding),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn save_onboarding(
    State(state): State<crate::State>,
    headers: HeaderMap,
    SessionToken(token): SessionToken,
    Json(input): Json<SaveOnboardingInput>,
) -> Result<Json<Onboarding>, ApiError> {
    let session = require_member(&state.pool, &token).await?;
    assert_same_origin(&headers)?;

    onboarding_upsert(
        &state.pool,
        &session.member_id,
        persona_str(input.persona),
        input.segment.map(segment_str),
        input.referral.map(referral_str),
        Utc::now().naive_utc(),
    )
    .await
    .map_err(db_error)?;

    Ok(Json(Onboarding {
        persona: input.persona,
        segment: input.segment,
        referral: input.referral,
    }))
}

/// One request header as text, or `None` when absent or not ASCII.
fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

/// Rejects a state-changing request whose `Origin`/`Referer` does not match the
/// host the browser used. A non-browser caller that sends neither is allowed.
fn assert_same_origin(headers: &HeaderMap) -> Result<(), ApiError> {
    let same_origin = is_same_origin(
        header(headers, "origin"),
        header(headers, "referer"),
        public_host(header(headers, "x-forwarded-host"), header(headers, "host")),
    );

    if same_origin {
        Ok(())
    } else {
        Err(ApiError::forbidden())
    }
}

fn persona_str(persona: OnboardingPersona) -> &'static str {
    match persona {
        OnboardingPersona::Owner => "owner",
        OnboardingPersona::Staff => "staff",
        OnboardingPersona::Exploring => "exploring",
        OnboardingPersona::Partner => "partner",
    }
}

fn segment_str(segment: OnboardingSegment) -> &'static str {
    match segment {
        OnboardingSegment::Restaurant => "restaurant",
        OnboardingSegment::Snack => "snack",
        OnboardingSegment::Market => "market",
        OnboardingSegment::Sweets => "sweets",
        OnboardingSegment::Other => "other",
    }
}

fn referral_str(referral: OnboardingReferral) -> &'static str {
    match referral {
        OnboardingReferral::Referral => "referral",
        OnboardingReferral::Instagram => "instagram",
        OnboardingReferral::Google => "google",
        OnboardingReferral::Other => "other",
    }
}
