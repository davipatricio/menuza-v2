//! Domain rules: argon2, sessions, money as cents. No HTTP, no axum, no sqlx,
//! no IO. Everything here is plain synchronous Rust so a handler can call it
//! without dragging a runtime or a connection into the crate.

pub mod coupon;
pub mod oauth;
pub mod password;
pub mod search;
pub mod seo;
pub mod session;
