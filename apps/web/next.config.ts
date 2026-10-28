import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { withSentryConfig } from "@sentry/nextjs/config";

const commerceInternal = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";

const tenantInternal = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the web image (.next/standalone).
  output: "standalone",
  typedRoutes: false,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Per PLAN §4: verified against next@16.4.0 + typescript@7.0.2.
    useTypeScriptCli: true,
    // Native forbidden()/unauthorized() pages for the dashboard (MEN-224).
    // Experimental upstream and not recommended for production; the real
    // 403 check belongs in proxy.ts (MEN-225).
    authInterrupts: true,
    // Next 16.4 agent tooling: nudge on a newer minor/major and let agents
    // prepare anonymized Next.js issue reports during `next dev` (no-op in CI).
    agentUpgrade: "latest",
    agentFeedback: true,
    // Next 16.4 Turbopack: reclaim unused compile work, compile client dynamic
    // imports on demand, and run plugin tools in-process instead of over sockets.
    turbopackGc: true,
    turbopackLazyDynamicImports: true,
    turbopackPluginRuntimeStrategy: "workerThreads",
  },
  typescript: {
    // Per PLAN §4: do not disable type checking. Leave undefined (= enabled).
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      { source: "/commerce/:path*", destination: `${commerceInternal}/:path*` },
      { source: "/tenant/:path*", destination: `${tenantInternal}/:path*` },
      { source: "/oauth/token", destination: `${tenantInternal}/oauth/token` },
      { source: "/oauth/revoke", destination: `${tenantInternal}/oauth/revoke` },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${tenantInternal}/.well-known/oauth-authorization-server`,
      },
      // The remote MCP server. Remote clients address the public app origin,
      // and this rewrite is what makes the `/mcp` URL in the dashboard's
      // snippet reach the tenant API that serves it.
      { source: "/mcp", destination: `${tenantInternal}/mcp` },
      { source: "/mcp/:path*", destination: `${tenantInternal}/mcp/:path*` },
      // Provider callbacks (Pagar.me) land on the commerce service, which owns
      // the integration token → tenant resolution.
      { source: "/webhooks/:path*", destination: `${commerceInternal}/:path*` },
    ];
  },
  transpilePackages: [],
  turbopack: {},
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

// Source map upload and release creation only run when a build token is
// present, so local builds and token-less CI stay offline (mirrors the API's
// no-DSN no-op). The token never travels to the client.
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  sourcemaps: { disable: !sentryAuthToken },
  release: { create: Boolean(sentryAuthToken) },
};

export default withSentryConfig(withSerwist(config), sentryBuildOptions);
