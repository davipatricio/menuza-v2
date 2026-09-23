# One Next.js app rendering three shells via host-aware routing

Landing, storefront, and management are layouts in a single `apps/web` app selected server-side in `proxy.ts` from the request host, with same-origin rewrites to the internal APIs, avoiding three deployments while keeping buyer and management surfaces isolated by host.

**Superseded in part by [ADR-0005](0005-surfaces-by-path-and-store-slug.md).** The single-app decision and the same-origin rewrites still hold. The host→shell mapping does not: marketing and dashboard are now path-based route groups on the main domain, and only the storefront remains host-resolved.
