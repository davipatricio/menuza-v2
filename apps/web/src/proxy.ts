/**
 * Main-domain + storefront routing.
 *
 * The app serves three surfaces by path on the main domain (marketing,
 * dashboard, storefront alias) while tenant hosts serve the storefront only:
 *   - "main"         — marketing (/, /about, /pricing, /contact), dashboard
 *                      (/dashboard), and the storefront path alias
 *                      (/store, /menu, /cart, /checkout)
 *   - "storefront"   — buyer-facing store on a tenant host
 *                      (/store, /menu, /cart, /checkout)
 *
 * Infrastructure paths (/serwist/*, /manifest.webmanifest, /favicon.ico,
 * /_next/static, /_next/image) are always permitted regardless of mode.
 * Any host that is not a known storefront host is treated as the main
 * domain (fail-open): unknown-host and cross-mode responses are 404, there
 * is no 403. See ADR-0005 for the model and MEN-225 for the phishing
 * follow-up this implies.
 *
 * Tenant resolution: a storefront host is looked up in the `Domain` table to
 * obtain its `tenantId`; the result is injected as the server-only
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
import { db, unscoped } from "@menuza/db";

type Mode = "main" | "storefront";

// Hosts that serve the storefront. Any other host — including hosts absent
// from the map — is treated as the main domain (fail-open; see ADR-0005).
// `WEB_HOST_MAP` keeps its `host=mode` CSV shape; only `storefront` entries
// take effect. `WEB_MAIN_DOMAIN` and `WEB_STORE_DOMAIN_SUFFIX` name the main
// domain and the store subdomain pattern; they are documented now and
// consumed by the MEN-225 cutover.
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

async function resolveTenantId(host: string): Promise<string | null> {
  const cached = tenantCache.get(host);

  if (cached !== undefined) return cached;

  const domain = await unscoped(() =>
    db.orm.public.Domain.where({ host }).select("tenantId").first(),
  );

  const tenantId = domain?.tenantId ?? null;

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
  const list = PREFIXES[mode];

  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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

      if (fwd) return fwd.split(",")[0]!.trim().toLowerCase().split(":")[0]!;
    }
  }

  return (req.headers.get("host") ?? "").toLowerCase().split(":")[0]!;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  if (isAlwaysAllowed(pathname)) return NextResponse.next();

  const host = resolveHost(req);
  const mode: Mode = STOREFRONT_HOSTS.has(host) ? "storefront" : "main";

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
