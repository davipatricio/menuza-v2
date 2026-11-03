//! orders resource DTOs, ported from the Bun panel contract.
//!
//! An order carries two independent status axes, financial and fulfilment, so
//! the panel keeps them apart and a move on one never touches the other. The
//! order is addressed by its human code, never its id.
//!
//! The transition list is already filtered by the caller's capabilities: the
//! dashboard renders exactly these buttons, so a `staff` member never sees a
//! refund the API would refuse.

use crate::ErrorCode;
use crate::commerce::orders::OrderAxis;

/// Longest reason a transition may carry.
pub const REASON_MAX: usize = 500;

/// Longest order code the panel addresses.
pub const ORDER_CODE_MAX: usize = 64;

/// The money states the panel renders.
const FINANCIAL_STATUSES: [&str; 7] = [
    "pending",
    "awaiting_payment",
    "pending_on_delivery",
    "paid",
    "refunded",
    "expired",
    "canceled",
];

/// The fulfilment states the panel renders.
const FULFILMENT_STATUSES: [&str; 8] = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "ready_for_pickup",
    "out_for_delivery",
    "completed",
    "canceled",
];

/// The payment methods checkout accepts.
const PAYMENT_METHODS: [&str; 8] = [
    "pix",
    "credit",
    "debit",
    "meal_voucher",
    "food_voucher",
    "boleto",
    "cash_on_delivery",
    "card_on_delivery",
];

/// One order row as the panel's tables render it. Money is Int cents and the
/// two status axes are independent; `paidAt`/`expiresAt` cross as null rather
/// than being omitted.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrder {
    pub id: String,
    pub code: String,
    pub customer_id: String,
    pub customer_name: String,
    pub subtotal_cents: i32,
    pub discount_cents: i32,
    pub shipping_cents: i32,
    pub wallet_applied_cents: i32,
    pub cashback_cents: i32,
    pub total_cents: i32,
    pub financial_status: String,
    pub fulfilment_status: String,
    pub payment_method: Option<String>,
    /// RFC 3339 with milliseconds and a trailing `Z`.
    pub paid_at: Option<String>,
    pub expires_at: Option<String>,
    pub created_at: String,
}

/// One line of an order, with the name and price copied at checkout time.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrderItem {
    pub id: String,
    pub name: String,
    pub unit_price_cents: i32,
    pub quantity: i32,
    pub line_total_cents: i32,
    pub options_label: Option<String>,
}

/// One row of the append-only order trail. `type` stays free text so a new
/// event does not break an older panel; `actorName` is null for a machine
/// action or a member that is gone.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrderEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub from_value: Option<String>,
    pub to_value: Option<String>,
    pub reason: Option<String>,
    pub actor_name: Option<String>,
    pub created_at: String,
}

/// One order plus its lines and event trail.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrderDetail {
    pub id: String,
    pub code: String,
    pub customer_id: String,
    pub customer_name: String,
    pub subtotal_cents: i32,
    pub discount_cents: i32,
    pub shipping_cents: i32,
    pub wallet_applied_cents: i32,
    pub cashback_cents: i32,
    pub total_cents: i32,
    pub financial_status: String,
    pub fulfilment_status: String,
    pub payment_method: Option<String>,
    pub paid_at: Option<String>,
    pub expires_at: Option<String>,
    pub created_at: String,
    pub items: Vec<PanelOrderItem>,
    pub events: Vec<PanelOrderEvent>,
}

/// `{ orders }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrdersOutput {
    pub orders: Vec<PanelOrder>,
}

/// `{ order }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrderOutput {
    pub order: PanelOrderDetail,
}

/// The optional filters the board narrows by. An absent key is "no filter",
/// never a wildcard.
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrdersQuery {
    pub financial_status: Option<String>,
    pub fulfilment_status: Option<String>,
    pub payment_method: Option<String>,
}

impl PanelOrdersQuery {
    /// An empty value means "no filter"; anything else must be one of the
    /// closed status lists. A refusal is `VALIDATION_FAILED`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        let invalid = |value: Option<&String>, allowed: &[&str]| {
            value.is_some_and(|value| !value.is_empty() && !allowed.contains(&value.as_str()))
        };

        if invalid(self.financial_status.as_ref(), &FINANCIAL_STATUSES)
            || invalid(self.fulfilment_status.as_ref(), &FULFILMENT_STATUSES)
            || invalid(self.payment_method.as_ref(), &PAYMENT_METHODS)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }

    /// The financial filter, with the empty string read as absent.
    pub fn financial(&self) -> Option<&str> {
        self.financial_status
            .as_deref()
            .filter(|value| !value.is_empty())
    }

    /// The fulfilment filter, with the empty string read as absent.
    pub fn fulfilment(&self) -> Option<&str> {
        self.fulfilment_status
            .as_deref()
            .filter(|value| !value.is_empty())
    }

    /// The payment-method filter, with the empty string read as absent.
    pub fn payment(&self) -> Option<&str> {
        self.payment_method
            .as_deref()
            .filter(|value| !value.is_empty())
    }
}

/// One legal move out of the order's current state, already filtered by the
/// caller's capabilities.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrderTransition {
    pub axis: OrderAxis,
    pub to: String,
    pub requires_reason: bool,
}

/// `{ transitions }`.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrderTransitionsOutput {
    pub transitions: Vec<PanelOrderTransition>,
}

/// What a mutation returns: both axes plus the moves that are still legal.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelOrderStateOutput {
    pub financial_status: String,
    pub fulfilment_status: String,
    pub transitions: Vec<PanelOrderTransition>,
}

/// `POST …/orders/{orderCode}/transition` body. The path addresses the order,
/// so the body only names the axis, the target and the optional reason.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PanelOrderTransitionInput {
    pub axis: OrderAxis,
    pub to: String,
    pub reason: Option<String>,
}

impl PanelOrderTransitionInput {
    /// `to`: 1..=64 after trimming; `reason`: at most 500 characters.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.to.trim().is_empty()
            || self.to.chars().count() > ORDER_CODE_MAX
            || self
                .reason
                .as_deref()
                .is_some_and(|reason| reason.chars().count() > REASON_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}
