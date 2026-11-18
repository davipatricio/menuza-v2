/**
 * Host resolution for the request middleware (server-only).
 *
 * Port of `apps/web/src/proxy.ts:49-136,158-216`, plus the pathname gates at
 * :138-154 so a resolved host can still be refused. `src/start.ts` calls
 * `resolveHost` once per request and turns the result into either the
 * `x-menuza-mode`/`x-menuza-host`/`x-menuza-tenant-id` headers or a 404.
 *
 * The app serves marketing and the dashboard on the main domain, while tenant
 * hosts serve the storefront only:
 *   - "main"         — marketing (/, /about, /pricing, /contact) and dashboard
 *                      (/dashboard)
 *   - "storefront"   — buyer-facing store on a tenant host
 *                      (/store, /menu, /cart, /checkout)
 *
 * Infrastructure paths (/serwist/*, /manifest.webmanifest, /favicon.ico,
 * /sitemap.xml, /robots.txt, /_next/static, /_next/image) are always permitted
 * regardless of mode. Hosts are resolved by an explicit allowlist (fail-closed):
 * a `storefront` entry in `WEB_HOST_MAP` is the storefront, `WEB_MAIN_DOMAIN` is
 * the main domain, and the development hosts are main outside production. Every
 * other host is denied. Unknown-host and cross-mode responses are 404, there is
 * no 403. See ADR-0005 and its 2026-09-22 amendment.
 *
 * Tenant resolution: a storefront host is resolved through the tenant API's
 * internal `resolveHost` procedure (`Domain` lives there, and the web app never
 * reads the database directly). The call is server-side, targets
 * `TENANT_INTERNAL_URL`, and authenticates with the shared `INTERNAL_API_SECRET`
 * token; the result becomes the server-only `x-menuza-tenant-id` header. A
 * storefront host with no `Domain` row is unknown and returns 404. The main
 * domain never resolves a tenant. Lookups are cached in-process (small,
 * manually invalidated on tenant/domain changes).
 *
 * Forwarded-host handling: requires TRUSTED_PROXY_HOP_IPS to be a non-empty
 * comma-separated list of trusted reverse-proxy IPs. Without it, no forwarded
 * header is honored, so client-supplied headers from arbitrary IPs cannot spoof
 * the host.
 */
import type { ResolveHostOutput } from "@menuza/api-client/model/resolveHostOutput";
import { getResolveTenantByStorefrontHostUrl } from "@menuza/api-client/tenant";

type Mode = "main" | "storefront";

/**
 * One request's host verdict: the surface plus the tenant to inject, a 404
 * reason, or `pass` for an infrastructure path, which the ported proxy lets
 * through before it looks at the host at all (proxy.ts:221).
 */
export type HostResolution =
  | { mode: Mode; host: string; tenantId: string | null }
  | { deny: "unknown-host" | "not-found" }
  | { pass: true };

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

// Local development hosts. Excluded from production (see `resolveMode`) so a
// laptop's `localhost` never serves the main domain on a real deployment.
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// A quick Cloudflare tunnel (`cloudflared tunnel --url`) hands out a random
// `*.trycloudflare.com` host. Development only, same as `DEV_HOSTS`.
const DEV_TUNNEL_SUFFIX = ".trycloudflare.com";

export function normalizePeerIp(ip: string | null | undefined): string {
  const trimmed = (ip ?? "").trim().toLowerCase();

  return trimmed.startsWith("::ffff:") ? trimmed.slice("::ffff:".length) : trimmed;
}

const TRUSTED_PROXY_HOPS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 0));

const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_HOP_IPS ?? "")
  .split(",")
  .map((s) => normalizePeerIp(s))
  .filter(Boolean);

const ALWAYS_ALLOW = [
  "/serwist",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/sitemap.xml",
  "/robots.txt",
];

const PREFIXES = {
  main: ["/about", "/pricing", "/contact", "/dashboard", "/oauth"],
  storefront: ["/store", "/menu", "/cart", "/checkout"],
} as const;

// Same-origin API mounts, proxied to the loopback services by `vite.config.ts`.
// Browser code calls these directly (`/tenant` for the dashboard, `/commerce`
// for the buyer flow), so they must pass for every *resolved* host — the host
// allowlist has already rejected unknown hosts before `isAllowed` runs.
// `/webhooks` carries provider callbacks: the integration token in the path is
// what authenticates them, so no tenant or session applies.
// `/mcp` and `/.well-known/oauth-authorization-server` carry the remote MCP
// server and its RFC 8414 discovery document: external clients address them on
// the public origin, so both must resolve the host and reach `proxyUpstream`.
const API_PREFIXES = [
  "/commerce",
  "/tenant",
  "/webhooks",
  "/mcp",
  "/.well-known/oauth-authorization-server",
] as const;

// TanStack Start posts server functions (mutations and client-side loader
// calls) to this mount. It is same-origin RPC the app itself serves, so it must
// pass for every *resolved* host like the API mounts above.
const SERVER_FN_PREFIX = "/_serverFn";

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

// The generated URL carries the browser mount (`/tenant`); the internal origin serves the bare path.
function stripTenantMount(path: string): string {
  if (!path.startsWith("/tenant/")) return path;

  return path.slice("/tenant".length);
}

/** Resolves one host against the tenant API's internal route; throws when it fails. */
async function resolveTenantId(host: string): Promise<string | null> {
  const cached = tenantCache.get(host);

  if (cached !== undefined) return cached;

  const origin = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

  const res = await fetch(
    `${origin}${stripTenantMount(getResolveTenantByStorefrontHostUrl({ host }))}`,
    {
      headers: { "x-menuza-internal-token": process.env.INTERNAL_API_SECRET ?? "" },
    },
  );

  if (!res.ok) throw new Error(`tenant ${res.status}`);

  // SAFETY: the route and the contract document the same Rust DTO, whose only
  // field is `tenantId`.
  const { tenantId } = (await res.json()) as ResolveHostOutput;

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
  const list = [...PREFIXES[mode], ...API_PREFIXES, SERVER_FN_PREFIX];

  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Deny by default: `null` means the host is not allowlisted, so the caller
// returns 404 rather than falling back to the main domain.
function resolveMode(host: string): Mode | null {
  if (STOREFRONT_HOSTS.has(host)) return "storefront";

  if (MAIN_HOST && host === MAIN_HOST) return "main";

  // Development hosts stay main only outside production.
  if (
    process.env.NODE_ENV !== "production" &&
    (DEV_HOSTS.has(host) || host.endsWith(DEV_TUNNEL_SUFFIX))
  ) {
    return "main";
  }

  return null;
}

// A Host header carries an optional port, but a bracketed IPv6 literal contains
// colons of its own, so cutting at the first colon would truncate `[::1]:3000`
// to `[` and silently miss the development allowlist entry.
export function stripPort(value: string): string {
  const bracketed = /^\[([^\]]+)\]/.exec(value);

  if (bracketed) return `[${bracketed[1]!}]`;

  const colon = value.indexOf(":");

  return colon === -1 ? value : value.slice(0, colon);
}

/**
 * The forwarded host, honored only when the direct TCP socket peer (`peerIp`)
 * is an allowlisted reverse proxy. Never reads `x-forwarded-for` to establish
 * proxy trust — a client can forge that header directly.
 */
export function trustedForwardedHost(
  request: Request,
  peerIp: string | null | undefined,
  hops: number = TRUSTED_PROXY_HOPS,
  trustedIps: readonly string[] = TRUSTED_PROXY_IPS,
): string | null {
  if (hops <= 0 || trustedIps.length === 0) return null;

  const peer = normalizePeerIp(peerIp);

  if (!peer || !trustedIps.includes(peer)) return null;

  const forwardedHost = request.headers.get("x-forwarded-host");

  if (!forwardedHost) return null;

  const parts = forwardedHost
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;

  return parts[Math.max(0, parts.length - hops)] ?? null;
}

/** proxy.ts:210 `resolveHost` — the host string, without a port. */
function requestHost(request: Request, peerIp?: string | null): string {
  // Trust forwarded-host only when the direct socket peer matches a trusted proxy IP.
  const host = trustedForwardedHost(request, peerIp) ?? request.headers.get("host") ?? "";

  return stripPort(host.toLowerCase());
}

/**
 * Resolves one request to its surface and tenant, or to the 404 the proxy
 * would have returned. `pass` mirrors the always-allowed short circuit at
 * proxy.ts:221, which runs before the host is even read.
 */
export async function resolveHost(
  request: Request,
  peerIp?: string | null,
): Promise<HostResolution> {
  const pathname = new URL(request.url).pathname;

  if (isAlwaysAllowed(pathname)) return { pass: true };

  const host = requestHost(request, peerIp);
  const mode = resolveMode(host);

  // Deny hosts that are not allowlisted before any surface is served.
  if (!mode) return { deny: "unknown-host" };

  if (!isAllowed(mode, pathname)) return { deny: "not-found" };

  // Only storefront hosts resolve a tenant. The main domain never does.
  const tenantId = mode === "storefront" ? await resolveTenantId(host) : null;

  // A storefront host must own a tenant.
  if (!tenantId && mode === "storefront") return { deny: "unknown-host" };

  return { mode, host, tenantId };
}
