//! Subdomains of the commerce API. Each folder is owned by one port and must
//! stay self-contained: no subdomain imports another.

pub mod orders;
pub mod payments;
pub mod public;
pub mod wallet;
