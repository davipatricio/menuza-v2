//! The wire contract the TypeScript backend left behind: code strings, statuses,
//! the error body, and the health DTO. No IO.

use contract::commerce::{Health, ServiceName};
use contract::{ApiErrorBody, ErrorCode};

const WIRE_CODES: [&str; 8] = [
    "\"TENANT_NOT_RESOLVED\"",
    "\"UNAUTHORIZED\"",
    "\"FORBIDDEN\"",
    "\"NOT_FOUND\"",
    "\"CONFLICT\"",
    "\"VALIDATION_FAILED\"",
    "\"RATE_LIMITED\"",
    "\"INTERNAL\"",
];

const STATUSES: [u16; 8] = [400, 401, 403, 404, 409, 400, 429, 500];

#[test]
fn codes_serialize_to_the_exact_wire_strings() {
    assert_eq!(ErrorCode::ALL.len(), WIRE_CODES.len());

    for (code, wire) in ErrorCode::ALL.into_iter().zip(WIRE_CODES) {
        assert_eq!(serde_json::to_string(&code).unwrap(), wire, "{code:?}");
    }
}

#[test]
fn codes_map_to_the_exact_http_statuses() {
    for (code, status) in ErrorCode::ALL.into_iter().zip(STATUSES) {
        assert_eq!(code.status(), status, "{code:?}");
    }

    assert!(!ErrorCode::Internal.is_client_error());
    assert!(ErrorCode::NotFound.is_client_error());
}

#[test]
fn error_body_omits_data_when_absent() {
    let body = ApiErrorBody::new(ErrorCode::NotFound);

    assert_eq!(
        serde_json::to_string(&body).unwrap(),
        "{\"code\":\"NOT_FOUND\",\"message\":\"Recurso não encontrado.\"}"
    );
}

#[test]
fn health_serializes_like_the_retired_endpoint() {
    let health = Health::new(ServiceName::Commerce);
    let json = serde_json::to_value(&health).unwrap();

    assert_eq!(json["status"], "ok");
    assert_eq!(json["service"], "commerce");

    let timestamp = json["timestamp"].as_str().expect("timestamp is a string");
    assert!(timestamp.ends_with('Z'), "{timestamp}");
    assert!(
        chrono::DateTime::parse_from_rfc3339(timestamp).is_ok(),
        "{timestamp}"
    );
}
