/**
 * Host-aware routing.
 *
 * Resolves the request's normalized host to one of three modes:
 *   - "landing"       — marketing site (/, /about, /pricing, /contact)
 *   - "storefront"    — buyer-facing store (/store, /menu, /cart, /checkout)
 *   - "management"    — store admin (/manage, /admin)
 *
 * Infrastructure paths (/serwist/*, /manifest.webmanifest, /favicon.ico,
 * /_next/static, /_next/image) are always permitted regardless of mode.
 * Unknown hosts return 403; cross-mode path access returns 404.
 *
 * Tenant resolution: after the mode is known, the host is looked up in the
 * `Domain` table to obtain its `tenantId`; the result is injected as the
 * server-only `x-menuza-tenant-id` header on the request forwarded to the
 * internal APIs. A known storefront/management host with no `Domain` row is
 * unknown and returns 404. Landing hosts may resolve to `null`. Lookups are
 * cached in-process (small, manually invalidated on tenant/domain changes).
 *
 * Forwarded-host handling: requires TRUSTED_PROXY_HOP_IPS to be a non-empty
 * comma-separated list of trusted reverse-proxy IPs. Without it, no
 * forwarded header is honored. Client-supplied headers from arbitrary IPs
 * cannot spoof the host.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, unscoped } from "@menuza/db";

type Mode = "landing" | "storefront" | "management";

const HOST_MAP = (process.env.WEB_HOST_MAP ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
  .reduce<Record<string, Mode>>((acc, entry) => {
    const [host, mode] = entry.split("=");

    if (host && (mode === "landing" || mode === "storefront" || mode === "management")) {
      acc[host] = mode;
    }

    return acc;
  }, {});

const TRUSTED_PROXY_HOPS = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 0));

const TRUSTED_PROXY_IPS = (process.env.TRUSTED_PROXY_HOP_IPS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALWAYS_ALLOW = ["/serwist", "/manifest.webmanifest", "/favicon.ico"];

const PREFIXES = {
  landing: ["/about", "/pricing", "/contact"],
  storefront: ["/store", "/menu", "/cart", "/checkout"],
  management: ["/manage", "/admin"],
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
  // The root is allowed for every mode (each mode has its own landing page).
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
  const mode = HOST_MAP[host];

  if (!mode) {
    return new NextResponse("Host desconhecido.", { status: 403 });
  }

  if (!isAllowed(mode, pathname)) {
    return new NextResponse("Não encontrado.", { status: 404 });
  }

  const tenantId = await resolveTenantId(host);

  // Storefront and management hosts must own a tenant. Landing hosts are
  // allowed to have none (marketing has no tenant).
  if (!tenantId && (mode === "storefront" || mode === "management")) {
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
