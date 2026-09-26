/**
 * Main-domain + storefront routing.
 *
 * The app serves marketing and the dashboard on the main domain, while tenant
 * hosts serve the storefront only:
 *   - "main"         — marketing (/, /about, /pricing, /contact) and dashboard
 *                      (/dashboard)
 *   - "storefront"   — buyer-facing store on a tenant host
 *                      (/store, /menu, /cart, /checkout)
 *
 * Infrastructure paths (/serwist/*, /manifest.webmanifest, /favicon.ico,
 * /_next/static, /_next/image) are always permitted regardless of mode.
 * Hosts are resolved by an explicit allowlist (fail-closed): a `storefront`
 * entry in `WEB_HOST_MAP` is the storefront, `WEB_MAIN_DOMAIN` is the main
 * domain, and the development hosts are main outside production. Every other
 * host is denied. Unknown-host and cross-mode responses are 404, there is no
 * 403. See ADR-0005 and its 2026-09-22 amendment.
 *
 * Tenant resolution: a storefront host is resolved through the tenant API's
 * internal `resolveHost` procedure (`Domain` lives there, and `apps/web` never
 * reads the database directly). The call is server-side, targets
 * `TENANT_INTERNAL_URL`, and authenticates with the shared
 * `INTERNAL_API_SECRET` token; the result is injected as the server-only
 * `x-menuza-tenant-id` header on the request forwarded to the internal APIs.
 * A storefront host with no `Domain` row is unknown and returns 404. The
 * main domain never resolves a tenant (dashboard tenant resolution by
 * `storeSlug` is MEN-225). Lookups are cached in-process (small, manually
 * invalidated on tenant/domain changes).
 *
 * Forwarded-host handling: requires TRUSTED_PROXY_HOP_IPS to be a non-empty
 * comma-separated list of trusted reverse-proxy IPs. Without it, no
 * forwarded header is honored. Client-supplied headers from arbitrary IPs
 * cannot spoof the host.
 */
import { NextRequest, NextResponse } from "next/server";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterContractClient } from "@orpc/contract";
import { tenantContractObject } from "@menuza/shared/tenant";

type TenantClient = RouterContractClient<typeof tenantContractObject>;

type Mode = "main" | "storefront";

// Hosts that serve the storefront. `WEB_HOST_MAP` keeps its `host=mode` CSV
// shape; only `storefront` entries take effect. Any other host is denied
// unless it is the main domain (see ADR-0005 and its 2026-09-22 amendment).
const STOREFRONT_HOSTS = new Set(
  (process.env.WEB_HOST_MAP ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((entry) => {
      const [host, mode] = entry.split("=");

      return host && mode === "storefront" ? [host] : [];
    }),
);

// The single host that serves the main domain. An absent (or empty)
// `WEB_MAIN_DOMAIN` leaves no production host as main, so only the
// development hosts below can reach it.
const MAIN_HOST = (process.env.WEB_MAIN_DOMAIN ?? "").trim().toLowerCase();

// Local development hosts. Excluded from production so a laptop's `localhost`
// never serves the main domain on a real deployment.
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const TRUSTED_PROXY_HOPS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 0));

const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_HOP_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALWAYS_ALLOW = ["/serwist", "/manifest.webmanifest", "/favicon.ico"];

const PREFIXES = {
  main: ["/about", "/pricing", "/contact", "/dashboard"],
  storefront: ["/store", "/menu", "/cart", "/checkout"],
} as const;

// Same-origin API mounts, rewritten to the loopback services by `next.config.ts`.
// Browser code calls these directly (`/tenant` for the dashboard, `/commerce`
// for the buyer flow), so they must pass for every *resolved* host — the host
// allowlist has already rejected unknown hosts before `isAllowed` runs.
const API_PREFIXES = ["/commerce", "/tenant"] as const;

/**
 * Host -> tenantId lookup cache. The set of hosts is small and changes rarely,
 * so entries never expire. Callers that add/change a `Domain` row must call
 * `invalidateTenantCache` to keep this fresh.
 */
const tenantCache = new Map<string, string | null>();

export function invalidateTenantCache(host?: string): void {
  if (host) tenantCache.delete(host.toLowerCase());
  else tenantCache.clear();
}

/** Fresh, per-request client bound to the tenant API's internal surface. */
function newTenantClient(origin: string): TenantClient {
  const link = new RPCLink({
    origin,
    url: "/rpc",
    headers: { "x-menuza-internal-token": process.env.INTERNAL_API_SECRET ?? "" },
  });

  return createORPCClient<TenantClient>(link);
}

async function resolveTenantId(host: string): Promise<string | null> {
  const cached = tenantCache.get(host);

  if (cached !== undefined) return cached;

  const origin = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";
  const { tenantId } = await newTenantClient(origin).internal.resolveHost({ host });

  tenantCache.set(host, tenantId);

  return tenantId;
}

function isAlwaysAllowed(pathname: string): boolean {
  if (ALWAYS_ALLOW.includes(pathname)) return true;

  if (pathname.startsWith("/_next/")) return true;

  if (pathname.startsWith("/serwist/")) return true;

  return false;
}

function isAllowed(mode: Mode, pathname: string): boolean {
  // The root is allowed for every mode.
  if (pathname === "/") return true;
  const list = [...PREFIXES[mode], ...API_PREFIXES];

  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Deny by default: `null` means the host is not allowlisted, so the caller
// returns 404 rather than falling back to the main domain.
function resolveMode(host: string): Mode | null {
  if (STOREFRONT_HOSTS.has(host)) return "storefront";

  if (MAIN_HOST && host === MAIN_HOST) return "main";

  // Development hosts stay main only outside production.
  if (process.env.NODE_ENV !== "production" && DEV_HOSTS.has(host)) return "main";

  return null;
}

// A Host header carries an optional port, but a bracketed IPv6 literal contains
// colons of its own, so cutting at the first colon would truncate `[::1]:3000`
// to `[` and silently miss the development allowlist entry.
function stripPort(value: string): string {
  const bracketed = /^\[([^\]]+)\]/.exec(value);

  if (bracketed) return `[${bracketed[1]!}]`;

  const colon = value.indexOf(":");

  return colon === -1 ? value : value.slice(0, colon);
}

function resolveHost(req: NextRequest): string {
  // Trust forwarded-host only when both:
  //   1. The remote address matches a trusted proxy IP.
  //   2. The number of forwarding hops doesn't exceed TRUSTED_PROXY_HOPS.
  if (TRUSTED_PROXY_HOPS > 0 && TRUSTED_PROXY_IPS.length > 0) {
    const remote = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const hopsHeader = req.headers.get("x-forwarded-for");
    const hops = hopsHeader ? Math.max(0, hopsHeader.split(",").length - 1) : 0;

    if (remote && TRUSTED_PROXY_IPS.includes(remote) && hops <= TRUSTED_PROXY_HOPS) {
      const fwd = req.headers.get("x-forwarded-host");

      if (fwd) return stripPort(fwd.split(",")[0]!.trim().toLowerCase());
    }
  }

  return stripPort((req.headers.get("host") ?? "").toLowerCase());
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  if (isAlwaysAllowed(pathname)) return NextResponse.next();

  const host = resolveHost(req);
  const mode = resolveMode(host);

  // Deny hosts that are not allowlisted before any surface is served.
  if (!mode) {
    return new NextResponse("Host desconhecido.", { status: 404 });
  }

  if (!isAllowed(mode, pathname)) {
    return new NextResponse("Não encontrado.", { status: 404 });
  }

  // Only storefront hosts resolve a tenant. The main domain never does.
  const tenantId = mode === "storefront" ? await resolveTenantId(host) : null;

  // A storefront host must own a tenant.
  if (!tenantId && mode === "storefront") {
    return new NextResponse("Host desconhecido.", { status: 404 });
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-menuza-mode", mode);
  requestHeaders.set("x-menuza-host", host);

  // Always overwrite: a client-supplied `x-menuza-tenant-id` must never
  // survive, even when the proxy itself resolved no tenant (defense-in-depth;
  // downstream middleware treats any non-empty value as resolved).
  requestHeaders.set("x-menuza-tenant-id", tenantId ?? "");

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
