//! payments resource DTOs, ported from the Bun panel contract.
//!
//! A gateway connection holds a credential the panel never reads back:
//! `hasCredentials` says whether one is stored, and the decrypted blob belongs
//! to the commerce adapter that talks to the provider, never to a response.
//!
//! `provider` is immutable after creation: switching an integration would keep
//! a webhook token pointing at a dead credential, so the store creates a new
//! integration and re-assigns the method instead.

use crate::ErrorCode;

/// Longest integration id an input accepts.
pub const ID_MAX: usize = 64;

/// Longest integration label, counted after trimming.
pub const LABEL_MAX: usize = 80;

/// Longest provider secret an input accepts.
pub const SECRET_MAX: usize = 200;

/// The two providers the `PaymentIntegration_provider_check` accepts.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum PaymentProvider {
    Pagarme,
    Offline,
}

impl PaymentProvider {
    /// The wire string, which is also the stored value.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pagarme => "pagarme",
            Self::Offline => "offline",
        }
    }

    /// A stored provider outside the closed set is `None`, so the caller can
    /// answer `INTERNAL` instead of rendering a gateway it cannot speak to.
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "pagarme" => Some(Self::Pagarme),
            "offline" => Some(Self::Offline),
            _ => None,
        }
    }

    /// `offline` needs no credential: the store reconciles the payment itself.
    pub fn needs_secret(self) -> bool {
        self == Self::Pagarme
    }
}

/// `active` or `disabled`, the two states the column accepts.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "lowercase")]
pub enum PaymentIntegrationStatus {
    Active,
    Disabled,
}

impl PaymentIntegrationStatus {
    /// The wire string, which is also the stored value.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Disabled => "disabled",
        }
    }

    /// An unknown stored status reads as `disabled`: it must not read as "on".
    pub fn parse(raw: &str) -> Self {
        match raw {
            "active" => Self::Active,
            _ => Self::Disabled,
        }
    }
}

/// The eight payment methods `PaymentMethodAssignment_method_check` accepts.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "snake_case")]
pub enum PaymentMethod {
    Pix,
    Credit,
    Debit,
    MealVoucher,
    FoodVoucher,
    Boleto,
    CashOnDelivery,
    CardOnDelivery,
}

impl PaymentMethod {
    /// The wire string, which is also the stored value.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pix => "pix",
            Self::Credit => "credit",
            Self::Debit => "debit",
            Self::MealVoucher => "meal_voucher",
            Self::FoodVoucher => "food_voucher",
            Self::Boleto => "boleto",
            Self::CashOnDelivery => "cash_on_delivery",
            Self::CardOnDelivery => "card_on_delivery",
        }
    }

    /// The path segment the `{method}` route carries.
    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "pix" => Some(Self::Pix),
            "credit" => Some(Self::Credit),
            "debit" => Some(Self::Debit),
            "meal_voucher" => Some(Self::MealVoucher),
            "food_voucher" => Some(Self::FoodVoucher),
            "boleto" => Some(Self::Boleto),
            "cash_on_delivery" => Some(Self::CashOnDelivery),
            "card_on_delivery" => Some(Self::CardOnDelivery),
            _ => None,
        }
    }
}

/// One gateway connection as the panel lists it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelPaymentIntegration {
    pub id: String,
    pub provider: PaymentProvider,
    pub label: String,
    pub status: PaymentIntegrationStatus,
    /// Whether a credential is stored. The secret itself never leaves the API.
    pub has_credentials: bool,
    pub webhook_path: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Which integration answers one payment method for the store.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelPaymentAssignment {
    pub method: PaymentMethod,
    pub integration_id: String,
    pub provider: PaymentProvider,
    pub label: String,
}

/// `{ integrations, assignments }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelPaymentSettingsOutput {
    pub integrations: Vec<PanelPaymentIntegration>,
    pub assignments: Vec<PanelPaymentAssignment>,
}

/// The body of create and update: absent `integrationId` creates.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavePaymentIntegrationInput {
    pub integration_id: Option<String>,
    pub provider: PaymentProvider,
    pub label: String,
    /// Required to create an online integration; absent on update keeps the
    /// stored credential.
    pub secret_key: Option<String>,
}

impl SavePaymentIntegrationInput {
    /// `integrationId`: 1..=64; `label`: 1..=80 after trimming; `secretKey`:
    /// 1..=200 and, for Pagar.me, starts with `sk_` — refusing a pasted `pk_`
    /// here is what stops a failed charge at checkout.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        let label = self.label.trim();

        if label.is_empty()
            || label.chars().count() > LABEL_MAX
            || self
                .integration_id
                .as_deref()
                .is_some_and(|id| id.is_empty() || id.chars().count() > ID_MAX)
            || self.secret_key.as_deref().is_some_and(|secret| {
                secret.is_empty()
                    || secret.chars().count() > SECRET_MAX
                    || (self.provider.needs_secret() && !secret.starts_with("sk_"))
            })
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ integration }`, returned by create and update alike.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelPaymentIntegrationOutput {
    pub integration: PanelPaymentIntegration,
}

/// `{ deleted }`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelPaymentDeleteOutput {
    pub deleted: bool,
}

/// The method arrives in the path; `null` clears the assignment.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavePaymentMethodAssignmentInput {
    pub integration_id: Option<String>,
}

impl SavePaymentMethodAssignmentInput {
    /// `integrationId`: 1..=64 when present.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self
            .integration_id
            .as_deref()
            .is_some_and(|id| id.is_empty() || id.chars().count() > ID_MAX)
        {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ assignments }`, the whole routing table after the write.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PanelPaymentAssignmentsOutput {
    pub assignments: Vec<PanelPaymentAssignment>,
}
