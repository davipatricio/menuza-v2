import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import { withSentryConfig } from "@sentry/nextjs/config";

const commerceInternal = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";

const tenantInternal = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

const config: NextConfig = {
  reactStrictMode: true,
  // Self-contained server for the web image (.next/standalone).
  output: "standalone",
  typedRoutes: true,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Per PLAN §4: verified against next@16.4.0-canary.19 + typescript@7.0.2.
    useTypeScriptCli: true,
  },
  typescript: {
    // Per PLAN §4: do not disable type checking. Leave undefined (= enabled).
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      { source: "/commerce/:path*", destination: `${commerceInternal}/:path*` },
      { source: "/tenant/:path*", destination: `${tenantInternal}/:path*` },
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
