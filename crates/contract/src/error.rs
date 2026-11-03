//! The closed error-code catalog and the JSON body every failure returns.

/// The eight error codes the TypeScript backend exposed. The wire strings and
/// their PT-BR messages are verbatim, and are not ours to improve: a client
/// already switches on them.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    TenantNotResolved,
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    ValidationFailed,
    RateLimited,
    Internal,
}

impl ErrorCode {
    /// Every code, in wire order. Used by the tests and the OpenAPI emit.
    pub const ALL: [ErrorCode; 8] = [
        ErrorCode::TenantNotResolved,
        ErrorCode::Unauthorized,
        ErrorCode::Forbidden,
        ErrorCode::NotFound,
        ErrorCode::Conflict,
        ErrorCode::ValidationFailed,
        ErrorCode::RateLimited,
        ErrorCode::Internal,
    ];

    /// The default message for this code, exactly as the retired backend sent it.
    pub fn message(self) -> &'static str {
        match self {
            ErrorCode::TenantNotResolved => "Não foi possível identificar o tenant da requisição.",
            ErrorCode::Unauthorized => "Sessão ausente ou inválida.",
            ErrorCode::Forbidden => "Operação não autorizada para esta sessão.",
            ErrorCode::NotFound => "Recurso não encontrado.",
            ErrorCode::Conflict => "Conflito de estado.",
            ErrorCode::ValidationFailed => "Dados de entrada inválidos.",
            ErrorCode::RateLimited => "Limite de requisições excedido.",
            ErrorCode::Internal => "Erro interno inesperado.",
        }
    }

    /// HTTP status as a plain u16: this crate must not depend on axum.
    pub fn status(self) -> u16 {
        match self {
            ErrorCode::TenantNotResolved => 400,
            ErrorCode::Unauthorized => 401,
            ErrorCode::Forbidden => 403,
            ErrorCode::NotFound => 404,
            ErrorCode::Conflict => 409,
            ErrorCode::ValidationFailed => 400,
            ErrorCode::RateLimited => 429,
            ErrorCode::Internal => 500,
        }
    }

    /// True for the 4xx half of the catalog, false for `Internal`.
    pub fn is_client_error(self) -> bool {
        self.status() < 500
    }
}

/// The JSON body of every API failure: `code`, a human message, optional data.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
pub struct ApiErrorBody {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl ApiErrorBody {
    pub fn new(code: ErrorCode) -> Self {
        Self {
            code,
            message: code.message().to_owned(),
            data: None,
        }
    }

    pub fn with_message(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    pub fn with_data(code: ErrorCode, data: serde_json::Value) -> Self {
        Self {
            code,
            message: code.message().to_owned(),
            data: Some(data),
        }
    }
}
