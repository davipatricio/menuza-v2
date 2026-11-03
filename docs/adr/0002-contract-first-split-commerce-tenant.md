# Contract-first oRPC with split commerce and tenant surfaces

> Superseded by ADR-0007 for the oRPC/`@menuza/api-*` layer: the two APIs are Rust binaries behind one OpenAPI contract. The split between commerce and tenant surfaces still holds.

Buyer-facing and management procedures live in separate versioned contracts in `@menuza/shared`, implemented by `@menuza/api-commerce` and `@menuza/api-tenant` behind thin `Bun.serve` shells on `/commerce` and `/tenant`, so the storefront can never import management operations and authorization boundaries stay explicit.
