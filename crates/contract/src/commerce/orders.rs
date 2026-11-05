//! orders subdomain DTOs, ported from the Bun contract.
//!
//! The dashboard's order page: the money, both status axes, the lines, the
//! append-only event trail and the transitions the **caller** may perform —
//! filtered with the caller's own capabilities, so a `staff` member never sees
//! a refund they would be refused.

/// Which axis of an order a transition moves.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum OrderAxis {
    Financial,
    Fulfilment,
}

/// One coupon checkout refused, and why.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RejectedCoupon {
    pub code: String,
    pub reason: String,
}

/// One line of the order.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrderItem {
    pub id: String,
    pub name: String,
    pub unit_price_cents: i32,
    pub quantity: i32,
    pub line_total_cents: i32,
    pub options_label: Option<String>,
}

/// One entry of the append-only event trail. `fromValue`/`toValue` hold either a
/// status slug or a signed-cent amount as text, depending on `type`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrderEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub from_value: Option<String>,
    pub to_value: Option<String>,
    pub reason: Option<String>,
    /// RFC 3339 with milliseconds and a trailing `Z`.
    pub created_at: String,
}

/// What the caller may do next on one axis.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OrderTransition {
    pub axis: OrderAxis,
    pub to: String,
    pub capability: String,
    pub requires_reason: bool,
}

/// Every move available to the caller at the current pair of statuses.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(transparent)]
pub struct OrderTransitions(pub Vec<OrderTransition>);

/// The dashboard's order page: money, both axes, lines, events and the moves the
/// caller may perform.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: String,
    pub code: String,
    pub customer_id: String,
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
    pub coupon_code: Option<String>,
    pub rejected_coupons: Vec<RejectedCoupon>,
    pub items: Vec<OrderItem>,
    pub events: Vec<OrderEvent>,
    pub allowed_next_transitions: OrderTransitions,
}

/// `GET /orders/{code}`, `POST /orders/{code}/transition` and
/// `POST /orders/{code}/expire`: an order is addressed by its human code, never
/// its id.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrderCodeInput {
    pub code: String,
}

impl OrderCodeInput {
    /// The input schema's own gate: the code is non-empty. A refusal is
    /// `VALIDATION_FAILED`.
    pub fn validate(&self) -> Result<(), crate::ErrorCode> {
        if self.code.trim().is_empty() {
            return Err(crate::ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `POST /orders/{code}/transition` body: move one axis to `to`, optionally
/// saying why. Whether the tuple is legal, and whether the reason is required,
/// is the state machine's call.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionOrderInput {
    pub code: String,
    pub axis: OrderAxis,
    pub to: String,
    pub reason: Option<String>,
}

impl TransitionOrderInput {
    /// The input schema's own gates: code and target are non-empty. A refusal is
    /// `VALIDATION_FAILED`.
    pub fn validate(&self) -> Result<(), crate::ErrorCode> {
        if self.code.trim().is_empty() || self.to.trim().is_empty() {
            return Err(crate::ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `POST /orders/{code}/transition` answer: both axes after the move.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TransitionOrderOutput {
    pub financial_status: String,
    pub fulfilment_status: String,
}

/// `POST /orders/{code}/expire` answer: the financial axis after the attempt.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ExpireOrderOutput {
    pub financial_status: String,
}

/// The payment methods checkout accepts, the same picklist the Bun contract
/// validates.
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

/// One dish the buyer put in a composed kit: which catalog dish, which
/// variation of it and how many.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateOrderKitItem {
    pub kit_item_id: String,
    pub variation_id: String,
    pub quantity: i32,
}

/// One line of a checkout: the catalog ids it names and the price the cart
/// quoted for it.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateOrderLine {
    pub product_id: Option<String>,
    pub variation_id: Option<String>,
    pub kit_id: Option<String>,
    /// The composition of a kit the buyer assembles. Absent for a product line
    /// and for a kit whose dishes the catalog locks.
    #[serde(default)]
    pub kit_items: Vec<CreateOrderKitItem>,
    pub name: String,
    pub unit_price_cents: i32,
    pub quantity: i32,
    pub catalog_discount_cents: Option<i32>,
}

/// `POST /orders` body, exactly the Bun checkout input: the customer, the
/// lines, the coupon codes typed by the buyer and the chosen method.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateOrderInput {
    pub customer_id: String,
    /// Absent: the server generates a six-character code.
    pub code: Option<String>,
    pub payment_method: Option<String>,
    pub shipping_cents: i32,
    pub wallet_requested_cents: i32,
    pub lines: Vec<CreateOrderLine>,
    pub coupon_codes: Vec<String>,
}

impl CreateOrderInput {
    /// The input schema's own gates, ported from `CreateOrderInputSchema` plus
    /// the duplicate-code check `createOrder` performs before pricing. A refusal
    /// is `VALIDATION_FAILED`.
    pub fn validate(&self) -> Result<(), crate::ErrorCode> {
        let empty_code = self
            .code
            .as_ref()
            .is_some_and(|code| code.trim().is_empty());

        let invalid_line = self.lines.iter().any(|line| {
            line.name.trim().is_empty()
                || line.unit_price_cents < 0
                || line.quantity < 1
                || (line.product_id.is_none()
                    && line.variation_id.is_none()
                    && line.kit_id.is_none())
                || line.kit_items.iter().any(|item| {
                    item.kit_item_id.trim().is_empty()
                        || item.variation_id.trim().is_empty()
                        || item.quantity < 1
                })
                || line
                    .catalog_discount_cents
                    .is_some_and(|discount| discount < 0)
        });

        if self.customer_id.trim().is_empty()
            || empty_code
            || self.shipping_cents < 0
            || self.wallet_requested_cents < 0
            || self.lines.is_empty()
            || self.coupon_codes.iter().any(|code| code.trim().is_empty())
            || invalid_line
        {
            return Err(crate::ErrorCode::ValidationFailed);
        }

        if let Some(method) = &self.payment_method
            && !PAYMENT_METHODS.contains(&method.as_str())
        {
            return Err(crate::ErrorCode::ValidationFailed);
        }

        // The same code twice is not a stacking request, it is a bug: replaying
        // a coupon would apply it once and record two redemptions.
        let mut codes: Vec<String> = self
            .coupon_codes
            .iter()
            .map(|code| code.trim().to_uppercase())
            .collect();

        codes.sort_unstable();
        codes.dedup();

        if codes.len() != self.coupon_codes.len() {
            return Err(crate::ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `POST /orders` answer, exactly the Bun checkout return: the money, both status
/// axes, the payment window and the coupons that lost.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrderOutput {
    pub id: String,
    pub code: String,
    pub subtotal_cents: i32,
    pub discount_cents: i32,
    pub shipping_cents: i32,
    pub wallet_applied_cents: i32,
    pub cashback_cents: i32,
    pub total_cents: i32,
    pub financial_status: String,
    pub fulfilment_status: String,
    /// RFC 3339 with milliseconds and a trailing `Z`.
    pub expires_at: Option<String>,
    pub rejected_coupons: Vec<RejectedCoupon>,
}

/// `POST /orders/{code}/payment` body: the order is addressed by its human code
/// on the path, exactly like the other order writes.
pub type RecordPaymentInput = OrderCodeInput;

/// `POST /orders/{code}/payment` answer: the financial axis after the attempt
/// and the cashback the order's wallet credit is worth.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecordPaymentOutput {
    pub financial_status: String,
    pub cashback_cents: i32,
}
