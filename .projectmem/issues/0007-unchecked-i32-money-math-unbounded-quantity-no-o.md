# #0007 Unchecked i32 money math, unbounded quantity, no overflow-checks in release

- 2026-11-17T22:09:21Z `issue`: Unchecked i32 money math, unbounded quantity, no overflow-checks in release [crates/persistence/src/commerce/orders.rs:928]
- 2026-11-17T22:09:21Z `issue`: record_payment uses body code over path code; POST /orders/A/payment pays B [crates/persistence/src/commerce/orders.rs:2012]
- 2026-11-17T23:36:01Z `fix`: Track 3 web proxy/SW/env hardening: socket-peer verification in trustedForwardedHost, upfront x-menuza-* stripping in server.ts and Vite dev proxy, OAuth discovery routed through proxyUpstream, SW process.env defines, VITE_SENTRY_* env/turbo sync, un-ignored uniwind-types.d.ts [apps/web/src/server/tenant-resolve.ts]
