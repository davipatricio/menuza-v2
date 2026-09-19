import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

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

export default withSerwist(config);
