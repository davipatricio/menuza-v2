//! payments resource: panel routes.
//!
//! The store's gateway connections and which one answers each payment method.
//! The provider secret goes in and never comes out: the read shape carries
//! `hasCredentials`, never the credential, and the decrypted blob is only
//! opened for the commerce adapter.
//!
//! `provider` is immutable after creation, and an integration a method still
//! points at is never deleted: the store has to say which integration answers
//! that method instead.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::payments::{
    PanelPaymentAssignment, PanelPaymentAssignmentsOutput, PanelPaymentDeleteOutput,
    PanelPaymentIntegration, PanelPaymentIntegrationOutput, PanelPaymentSettingsOutput,
    PaymentIntegrationStatus, PaymentMethod, PaymentProvider, SavePaymentIntegrationInput,
    SavePaymentMethodAssignmentInput,
};
use persistence::tenant::panel::payments::{
    AssignmentError, PaymentAssignmentRow, PaymentIntegrationRemoval, PaymentIntegrationRow,
    payment_assignment_clear, payment_assignment_list, payment_assignment_save,
    payment_integration_create, payment_integration_delete, payment_integration_find,
    payment_integration_list, payment_integration_update,
};

use super::support::{context, guard, iso, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/payments",
            axum::routing::get(get_payment_settings),
        )
        .route(
            "/panel/stores/{storeSlug}/payments/integrations",
            axum::routing::post(save_payment_integration),
        )
        .route(
            "/panel/stores/{storeSlug}/payments/integrations/{integrationId}",
            axum::routing::delete(delete_payment_integration),
        )
        .route(
            "/panel/stores/{storeSlug}/payments/methods/{method}",
            axum::routing::put(save_payment_method_assignment),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            get_payment_settings,
            save_payment_integration,
            delete_payment_integration,
            save_payment_method_assignment
        ),
        components(schemas(
            contract::tenant::panel::payments::PanelPaymentAssignment,
            contract::tenant::panel::payments::PanelPaymentAssignmentsOutput,
            contract::tenant::panel::payments::PanelPaymentDeleteOutput,
            contract::tenant::panel::payments::PanelPaymentIntegration,
            contract::tenant::panel::payments::PanelPaymentIntegrationOutput,
            contract::tenant::panel::payments::PanelPaymentSettingsOutput,
            contract::tenant::panel::payments::PaymentIntegrationStatus,
            contract::tenant::panel::payments::PaymentMethod,
            contract::tenant::panel::payments::PaymentProvider,
            contract::tenant::panel::payments::SavePaymentIntegrationInput,
            contract::tenant::panel::payments::SavePaymentMethodAssignmentInput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The store's gateway connections and the provider of each method.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/payments",
    operation_id = "getPanelPaymentSettings",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelPaymentSettingsOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_payment_settings(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<PanelPaymentSettingsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "payments:read")?;

    let rows = payment_integration_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let assignments = payment_assignment_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    Ok(Json(PanelPaymentSettingsOutput {
        integrations: rows
            .iter()
            .map(panel_integration)
            .collect::<Result<_, _>>()?,
        assignments: assignments.iter().filter_map(panel_assignment).collect(),
    }))
}

/// Creates or updates one gateway connection.
#[utoipa::path(
    post,
    path = "/panel/stores/{storeSlug}/payments/integrations",
    operation_id = "savePanelPaymentIntegration",
    tag = "panel",
    request_body = SavePaymentIntegrationInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = PanelPaymentIntegrationOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn save_payment_integration(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<SavePaymentIntegrationInput>,
) -> Result<Json<PanelPaymentIntegrationOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "payments:write")?;

    input.validate().map_err(ApiError)?;

    let label = input.label.trim();
    let integration_id = match input.integration_id.as_deref() {
        None => {
            let credentials = credentials_for(input.provider, input.secret_key.as_deref())?;

            payment_integration_create(
                &state.pool,
                &ctx.tenant,
                input.provider.as_str(),
                label,
                credentials.as_deref(),
                &webhook_token(),
                now(),
            )
            .await
            .map_err(db_error)?
        }
        Some(id) => {
            let existing = payment_integration_find(&state.pool, &ctx.tenant, id)
                .await
                .map_err(db_error)?
                .ok_or_else(ApiError::not_found)?;

            if existing.provider != input.provider.as_str() {
                return Err(ApiError(ErrorCode::ValidationFailed));
            }

            let credentials = match input.secret_key.as_deref() {
                None => None,
                Some(secret) => credentials_for(input.provider, Some(secret))?,
            };

            if !payment_integration_update(
                &state.pool,
                &ctx.tenant,
                id,
                label,
                credentials.as_deref(),
                now(),
            )
            .await
            .map_err(db_error)?
            {
                return Err(ApiError::not_found());
            }

            id.to_owned()
        }
    };

    let Some(row) = payment_integration_find(&state.pool, &ctx.tenant, &integration_id)
        .await
        .map_err(db_error)?
    else {
        return Err(ApiError(ErrorCode::Internal));
    };

    Ok(Json(PanelPaymentIntegrationOutput {
        integration: panel_integration(&row)?,
    }))
}

/// Deletes a connection no payment method points at.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/payments/integrations/{integrationId}",
    operation_id = "deletePanelPaymentIntegration",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("integrationId" = String, Path, description = "The connection to remove.")
    ),
    responses(
        (status = 200, body = PanelPaymentDeleteOutput),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn delete_payment_integration(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, integration_id)): Path<(String, String)>,
) -> Result<Json<PanelPaymentDeleteOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "payments:write")?;

    // One transaction answers all three cases: a method still pointing here
    // would silently turn off on delete, so it is a `409`, never a cascade.
    match payment_integration_delete(&state.pool, &ctx.tenant, &integration_id)
        .await
        .map_err(db_error)?
    {
        PaymentIntegrationRemoval::Removed => Ok(Json(PanelPaymentDeleteOutput { deleted: true })),
        PaymentIntegrationRemoval::Assigned => Err(ApiError(ErrorCode::Conflict)),
        PaymentIntegrationRemoval::Missing => Err(ApiError::not_found()),
    }
}

/// Points one payment method at one integration, or clears it with `null`.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/payments/methods/{method}",
    operation_id = "savePanelPaymentMethodAssignment",
    tag = "panel",
    request_body = SavePaymentMethodAssignmentInput,
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("method" = String, Path, description = "`pix`, `credit`, `debit`, …")
    ),
    responses(
        (status = 200, body = PanelPaymentAssignmentsOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn save_payment_method_assignment(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, method)): Path<(String, String)>,
    Json(input): Json<SavePaymentMethodAssignmentInput>,
) -> Result<Json<PanelPaymentAssignmentsOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "payments:write")?;

    input.validate().map_err(ApiError)?;

    let method = PaymentMethod::parse(&method).ok_or(ApiError(ErrorCode::ValidationFailed))?;

    if let Some(integration_id) = input.integration_id.as_deref() {
        // An id from another store is the same NOT_FOUND as an unknown one.
        if payment_integration_find(&state.pool, &ctx.tenant, integration_id)
            .await
            .map_err(db_error)?
            .is_none()
        {
            return Err(ApiError::not_found());
        }

        payment_assignment_save(
            &state.pool,
            &ctx.tenant,
            method.as_str(),
            integration_id,
            now(),
        )
        .await
        .map_err(|error| match error {
            // The pre-check above saw the store; this arm is the race the
            // statement closes.
            AssignmentError::ForeignIntegration(_) => ApiError::not_found(),
            AssignmentError::Database(error) => db_error(error),
        })?;
    } else {
        payment_assignment_clear(&state.pool, &ctx.tenant, method.as_str())
            .await
            .map_err(db_error)?;
    }

    let assignments = payment_assignment_list(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    Ok(Json(PanelPaymentAssignmentsOutput {
        assignments: assignments.iter().filter_map(panel_assignment).collect(),
    }))
}

/// The row as the panel reads it: presence of the secret, never the secret.
fn panel_integration(row: &PaymentIntegrationRow) -> Result<PanelPaymentIntegration, ApiError> {
    let provider = PaymentProvider::parse(&row.provider).ok_or(ApiError(ErrorCode::Internal))?;

    Ok(PanelPaymentIntegration {
        id: row.id.clone(),
        provider,
        label: row.label.clone(),
        status: PaymentIntegrationStatus::parse(&row.status),
        has_credentials: row.has_credentials,
        webhook_path: format!("/webhooks/pagarme/{}", row.webhook_token),
        created_at: iso(row.created_at),
        updated_at: iso(row.updated_at),
    })
}

/// The joined assignment; a method outside the closed set cannot render.
fn panel_assignment(row: &PaymentAssignmentRow) -> Option<PanelPaymentAssignment> {
    let method = PaymentMethod::parse(&row.method)?;
    let provider = PaymentProvider::parse(&row.provider)?;

    Some(PanelPaymentAssignment {
        method,
        integration_id: row.integration_id.clone(),
        provider,
        label: row.label.clone(),
    })
}

/// The envelope, or `None` for a provider that needs no secret.
///
/// `offline` reconciles the payment itself, so an absent secret is not an
/// error there; every other provider refuses to create without one.
fn credentials_for(
    provider: PaymentProvider,
    secret_key: Option<&str>,
) -> Result<Option<String>, ApiError> {
    if !provider.needs_secret() {
        return Ok(None);
    }

    let secret = secret_key.ok_or(ApiError(ErrorCode::ValidationFailed))?;

    // Pagar.me issues `sk_…` secrets and `pk_…` public keys; a pasted public
    // key would only fail later, at checkout.
    if !secret.starts_with("sk_") {
        return Err(ApiError(ErrorCode::ValidationFailed));
    }

    let envelope = persistence::tenant::panel::payments::encrypt_secret(
        &serde_json::json!({ "secretKey": secret }).to_string(),
    )
    .map_err(|_| ApiError(ErrorCode::Internal))?;

    Ok(Some(envelope))
}

/// Opaque callback secret: 32 random bytes as hex, no tenant information in it.
fn webhook_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_public_key_is_not_a_secret() {
        assert!(matches!(
            credentials_for(PaymentProvider::Pagarme, Some("pk_test_123")),
            Err(ApiError(ErrorCode::ValidationFailed))
        ));
        assert!(matches!(
            credentials_for(PaymentProvider::Pagarme, None),
            Err(ApiError(ErrorCode::ValidationFailed))
        ));
    }
}
