//! Closed wire contract for the Rust APIs: error codes and the DTOs utoipa
//! turns into the OpenAPI documents the TanStack client is generated from.
pub mod commerce;
pub mod error;
pub mod mcp;
pub mod oauth;
pub mod tenant;
pub use error::{ApiErrorBody, ErrorCode};
