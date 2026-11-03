//! The one layer stack both binaries mount.
//!
//! Order is a contract (ADR-0007). A layer added here lands on both APIs; a
//! layer copied into a binary is a bug.

use std::time::Duration;

use axum::Router;
use axum::http::{Request, Response};
use tower_http::catch_panic::CatchPanicLayer;
use tower_http::compression::CompressionLayer;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::request_id::{
    MakeRequestId, MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer,
};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::config::Env;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_BODY_BYTES: usize = 1024 * 1024;
const REQUEST_ID_HEADER: &str = "x-request-id";

/// Reuses an inbound request id, else mints a UUID. A proxy that already
/// assigned one keeps it, so one id spans the whole hop chain.
#[derive(Clone, Copy, Default)]
struct ReuseOrMakeRequestId;

impl MakeRequestId for ReuseOrMakeRequestId {
    fn make_request_id<B>(&mut self, request: &Request<B>) -> Option<RequestId> {
        match request.headers().get(REQUEST_ID_HEADER) {
            Some(inbound) => Some(RequestId::new(inbound.clone())),
            None => MakeRequestUuid.make_request_id(request),
        }
    }
}

/// Applies the stack, outside-in:
///
/// request id -> catch panic -> timeout 30s -> body limit 1 MiB -> compression
/// -> trace -> access log
///
/// `Router::layer` wraps the router it is called on, so the last call is the
/// outermost layer. The chain below is written innermost-first and reads
/// top-down as the list above.
pub fn apply<S>(router: Router<S>, env: Env) -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    // The default filter already runs this crate at debug in development.
    let access_level = match env {
        Env::Development => Level::DEBUG,
        Env::Production => Level::INFO,
    };

    router
        .layer(TraceLayer::new_for_http().on_response(DefaultOnResponse::new().level(access_level)))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &Request<_>| {
                    // Method, path and status only: a cookie or an
                    // `authorization` header must never reach the logs.
                    tracing::info_span!(
                        "http.request",
                        method = %request.method(),
                        path = %request.uri().path(),
                        status = tracing::field::Empty,
                    )
                })
                .on_response(
                    |response: &Response<_>, _latency: Duration, span: &tracing::Span| {
                        span.record("status", response.status().as_u16());
                    },
                ),
        )
        .layer(CompressionLayer::new())
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .layer(TimeoutLayer::with_status_code(
            axum::http::StatusCode::REQUEST_TIMEOUT,
            REQUEST_TIMEOUT,
        ))
        .layer(CatchPanicLayer::new())
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(ReuseOrMakeRequestId))
}
