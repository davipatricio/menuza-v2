# One Next.js app rendering three shells via host-aware routing

Landing, storefront, and management are layouts in a single `apps/web` app selected server-side in `proxy.ts` from the request host, with same-origin rewrites to the internal APIs, avoiding three deployments while keeping buyer and management surfaces isolated by host.
