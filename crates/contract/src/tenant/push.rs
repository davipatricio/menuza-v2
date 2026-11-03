//! push subdomain DTOs, ported from the Bun contract.
//!
//! Subscriptions are a collection whose endpoint URL travels in the body, never
//! as a path segment. Preferences are one row per `(tenantId, memberId, event)`,
//! so the input rejects duplicates up front instead of hitting the unique index.

use crate::ErrorCode;

/// The canonical notification events, in the order the dashboard lists them.
pub const PUSH_EVENTS: [PushEvent; 5] = [
    PushEvent::OrderCreated,
    PushEvent::PaymentConfirmed,
    PushEvent::PixExpired,
    PushEvent::OrderReady,
    PushEvent::OrderCancelled,
];

/// `PushEvent`, stored verbatim in the `PushPreference.event` column.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PushEvent {
    OrderCreated,
    PaymentConfirmed,
    PixExpired,
    OrderReady,
    OrderCancelled,
}

impl PushEvent {
    /// The wire string, which is also the stored value.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OrderCreated => "ORDER_CREATED",
            Self::PaymentConfirmed => "PAYMENT_CONFIRMED",
            Self::PixExpired => "PIX_EXPIRED",
            Self::OrderReady => "ORDER_READY",
            Self::OrderCancelled => "ORDER_CANCELLED",
        }
    }

    /// Parses a stored value; an unknown one is not an event this contract knows.
    pub fn parse(raw: &str) -> Option<Self> {
        PUSH_EVENTS.into_iter().find(|event| event.as_str() == raw)
    }
}

/// Only the documented push provider hosts, and their subdomains, may receive a
/// subscription. Suffixes are matched at `.` boundaries so a lookalike such as
/// `fcm.googleapis.com.attacker.tld` is refused.
pub const PUSH_ENDPOINT_SUFFIXES: [&str; 4] = [
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "notify.windows.com",
    "web.push.apple.com",
];

/// `isAllowedPushEndpoint` from `@menuza/shared/push`: HTTPS only, no userinfo,
/// no explicit port, and a host under one of the provider suffixes.
pub fn is_allowed_push_endpoint(endpoint: &str) -> bool {
    let Some(rest) = endpoint
        .get(..8)
        .filter(|scheme| scheme.eq_ignore_ascii_case("https://"))
        .map(|_| &endpoint[8..])
    else {
        return false;
    };

    // The authority ends where the path, query or fragment begins.
    let authority = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    if authority.is_empty()
        || authority.contains('@')
        || authority.contains(':')
        || authority.starts_with('.')
        || authority.ends_with('.')
        || authority.contains("..")
        || !authority
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-'))
    {
        return false;
    }

    PUSH_ENDPOINT_SUFFIXES
        .into_iter()
        .any(|suffix| authority == suffix || authority.ends_with(&format!(".{suffix}")))
}

/// `v.strictObject({ p256dh, auth })`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushSubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

impl PushSubscriptionKeys {
    /// Both keys are `nonEmpty`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.p256dh.is_empty() || self.auth.is_empty() {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `v.strictObject({ endpoint, keys, expirationTime? })`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushSubscriptionInput {
    pub endpoint: String,
    pub keys: PushSubscriptionKeys,
    #[serde(default)]
    pub expiration_time: Option<i64>,
}

impl PushSubscriptionInput {
    /// The input schema's own gates: a valid endpoint, non-empty keys. The SSRF
    /// policy is part of validation, not the handler.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if !is_allowed_push_endpoint(&self.endpoint) {
            return Err(ErrorCode::ValidationFailed);
        }

        self.keys.validate()
    }
}

/// `v.strictObject({ endpoint })`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushUnsubscribeInput {
    pub endpoint: String,
}

impl PushUnsubscribeInput {
    /// `endpoint: nonEmpty`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.endpoint.is_empty() {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `v.strictObject({ events })`, at most one row per event and no duplicates.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PushPreferencesInput {
    pub events: Vec<PushEvent>,
}

impl PushPreferencesInput {
    /// `UniquePushEventsSchema`: capped at the event count and deduplicated.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.events.len() > PUSH_EVENTS.len() {
            return Err(ErrorCode::ValidationFailed);
        }

        for (index, event) in self.events.iter().enumerate() {
            if self.events[..index].contains(event) {
                return Err(ErrorCode::ValidationFailed);
            }
        }

        Ok(())
    }
}

/// `{ publicKey }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetPublicKeyOutput {
    pub public_key: String,
}

/// `{ events }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushPreferencesOutput {
    pub events: Vec<PushEvent>,
}

/// `{ success }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushSuccessOutput {
    pub success: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_push_event_round_trips_the_wire_string() {
        for event in PUSH_EVENTS {
            assert_eq!(PushEvent::parse(event.as_str()), Some(event));
        }

        assert_eq!(PushEvent::parse("order_created"), None);
    }

    #[test]
    fn shell_push_endpoint_policy_allows_only_provider_hosts() {
        for endpoint in [
            "https://fcm.googleapis.com/fcm/send/token",
            "https://updates.push.services.mozilla.com/wpush",
            "https://notify.windows.com/",
            "https://web.push.apple.com/push",
        ] {
            assert!(is_allowed_push_endpoint(endpoint), "{endpoint}");
        }

        for endpoint in [
            "http://fcm.googleapis.com/sub",
            "https://localhost/sub",
            "https://127.0.0.1/sub",
            "https://evil-fcm.googleapis.com.attacker.tld/fcm/send",
            "https://updates.push.services.mozilla.com.attacker.tld/wpush",
            "https://user:pass@fcm.googleapis.com/sub",
            "https://fcm.googleapis.com:8443/sub",
            "https://fcm.googleapis.com@attacker.tld/sub",
            "not a url",
        ] {
            assert!(!is_allowed_push_endpoint(endpoint), "{endpoint}");
        }
    }

    #[test]
    fn shell_push_preferences_reject_duplicates_and_overflow() {
        let duplicate = PushPreferencesInput {
            events: vec![PushEvent::OrderCreated, PushEvent::OrderCreated],
        };
        assert_eq!(duplicate.validate(), Err(ErrorCode::ValidationFailed));

        let overflow = PushPreferencesInput {
            events: vec![
                PushEvent::OrderCreated,
                PushEvent::PaymentConfirmed,
                PushEvent::PixExpired,
                PushEvent::OrderReady,
                PushEvent::OrderCancelled,
                PushEvent::OrderCreated,
            ],
        };
        assert_eq!(overflow.validate(), Err(ErrorCode::ValidationFailed));

        let valid = PushPreferencesInput {
            events: vec![PushEvent::OrderCreated, PushEvent::OrderReady],
        };
        assert_eq!(valid.validate(), Ok(()));
    }
}
