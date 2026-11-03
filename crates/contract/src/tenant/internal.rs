//! internal subdomain DTOs, ported from the Bun contract.
//!
//! Service-to-service only: the web proxy resolves a storefront host to the
//! tenant the `Domain` row names, gated by the shared internal token.

use crate::ErrorCode;

/// `GET /internal/resolve-host` query: the storefront host to resolve.
#[derive(Debug, Clone, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveHostInput {
    pub host: String,
}

impl ResolveHostInput {
    /// The input schema's own gates: the contract requires a non-empty host of
    /// at most 253 characters. A refusal is `VALIDATION_FAILED`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.host.is_empty() || self.host.chars().count() > 253 {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// The tenant the host names, or `null` when no `Domain` row has it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResolveHostOutput {
    /// Always present: an unknown host answers `null`, never a missing key.
    #[schema(required)]
    pub tenant_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shell_resolve_host_output_serialises_tenant_id() {
        let output = ResolveHostOutput {
            tenant_id: Some("tenant-abc".to_owned()),
        };

        assert_eq!(
            serde_json::to_value(&output).expect("json"),
            serde_json::json!({ "tenantId": "tenant-abc" })
        );
    }

    #[test]
    fn shell_resolve_host_output_keeps_the_key_when_null() {
        let output = ResolveHostOutput { tenant_id: None };

        assert_eq!(
            serde_json::to_value(&output).expect("json"),
            serde_json::json!({ "tenantId": null })
        );
    }

    #[test]
    fn shell_resolve_host_input_matches_the_contract_gates() {
        assert_eq!(
            ResolveHostInput {
                host: String::new()
            }
            .validate(),
            Err(ErrorCode::ValidationFailed)
        );
        assert_eq!(
            ResolveHostInput {
                host: "a".repeat(254)
            }
            .validate(),
            Err(ErrorCode::ValidationFailed)
        );
        assert_eq!(
            ResolveHostInput {
                host: "a".repeat(253)
            }
            .validate(),
            Ok(())
        );
        assert_eq!(
            ResolveHostInput {
                host: "store.localhost".to_owned()
            }
            .validate(),
            Ok(())
        );
    }
}
