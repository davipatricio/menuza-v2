//! payments subdomain DTOs, ported from the Bun contract.
//!
//! A provider callback is persisted and queued by the webhook receiver; the
//! worker then calls the route that applies it. The input names the stored
//! event, the answer says what applying it did to the order.

/// `POST /payments/gateway-events/{gatewayEventId}/apply` body: the id of the
/// already-persisted event.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApplyGatewayEventInput {
    pub gateway_event_id: String,
}

impl ApplyGatewayEventInput {
    /// The input schema's own gate: the id is non-empty. A refusal is
    /// `VALIDATION_FAILED`.
    pub fn validate(&self) -> Result<(), crate::ErrorCode> {
        if self.gateway_event_id.trim().is_empty() {
            return Err(crate::ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// What applying one event did, the same picklist the Bun contract returns:
/// `applied`, `ignored`, `rejected` or `missing`.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum GatewayEventOutcome {
    Applied,
    Ignored,
    Rejected,
    Missing,
}

/// `POST /payments/gateway-events/{gatewayEventId}/apply` answer.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ApplyGatewayEventOutput {
    pub status: GatewayEventOutcome,
}
