# Contract-first oRPC with split commerce and tenant surfaces

Buyer-facing and management procedures live in separate versioned contracts in `@menuza/shared`, implemented by `@menuza/api-commerce` and `@menuza/api-tenant` behind thin `Bun.serve` shells on `/commerce` and `/tenant`, so the storefront can never import management operations and authorization boundaries stay explicit.
