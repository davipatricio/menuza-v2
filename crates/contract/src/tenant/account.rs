//! account subdomain DTOs, ported from the Bun contract.
//!
//! Member-level, not store-level: a management account spans stores, so none of
//! these shapes carries a `storeSlug`. `ActiveSession.id` is the SHA-256 digest
//! of the bearer token, never a usable credential.

use crate::ErrorCode;

/// `v.strictObject({ currentPassword, newPassword })`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangePasswordInput {
    pub current_password: String,
    pub new_password: String,
}

impl ChangePasswordInput {
    /// `currentPassword: nonEmpty + maxLength(200)`,
    /// `newPassword: minLength(8) + maxLength(200)`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.current_password.is_empty() || self.current_password.chars().count() > 200 {
            return Err(ErrorCode::ValidationFailed);
        }

        if !(8..=200).contains(&self.new_password.chars().count()) {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// `{ changed }`; false when the submitted password was the current one.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordOutput {
    pub changed: bool,
}

/// One live session row, as the account page lists it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession {
    pub id: String,
    pub current: bool,
    pub created_at: String,
    pub last_used_at: String,
    pub expires_at: String,
}

/// `{ sessions }`, newest used first.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSessionsOutput {
    pub sessions: Vec<ActiveSession>,
}

/// The path segment the revocation addresses: a digest, not a token.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RevokeSessionInput {
    pub session_id: String,
}

impl RevokeSessionInput {
    /// `v.regex(/^[0-9a-f]{64}$/)`.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.session_id.len() == 64
            && self
                .session_id
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            Ok(())
        } else {
            Err(ErrorCode::ValidationFailed)
        }
    }
}

/// `{ revoked }`, the number of rows the statement actually changed.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RevokeSessionOutput {
    pub revoked: u64,
}

/// The confirmation `DELETE /account` requires.
///
/// Deleting an account is not undoable, so the body must repeat the member's
/// own e-mail address. A stolen session can therefore not erase the account by
/// sending an empty body: the attacker has to know the credential it is abusing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteAccountInput {
    pub email: String,
}

impl DeleteAccountInput {
    /// `email: nonEmpty + maxLength(320)`, compared case-insensitively by the
    /// handler against the authenticated member.
    pub fn validate(&self) -> Result<(), ErrorCode> {
        if self.email.trim().is_empty() || self.email.chars().count() > 320 {
            return Err(ErrorCode::ValidationFailed);
        }

        Ok(())
    }
}

/// What a deletion actually did, so the client can say it honestly.
///
/// `stores_archived` counts stores the member solely owned: those are emptied
/// and archived, never deleted, because their orders are another store's
/// transaction history and a buyer's receipt.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountOutput {
    pub deleted: bool,
    pub stores_archived: u64,
    pub memberships_removed: u64,
}
