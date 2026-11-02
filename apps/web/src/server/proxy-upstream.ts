/**
 * Same-origin API proxying (server-only).
 *
 * Port of the rewrites in `apps/web/next.config.ts:37-55` to the Start server.
 * `vite.config.ts` mirrors the same mounts for dev, but a Vite proxy only exists
 * in dev, so production needs this: `src/server.ts` calls `proxyUpstream` after
 * host resolution and before the Start handler, the same seam where Next ran
 * the rewrites.
 *
 * Only the mounts below match. Every other path returns `null` so the caller
 * keeps handling it — the proxy must not become an open relay.
 * `/commerce`, `/tenant` and `/webhooks/*` strip their mount prefix upstream;
 * the OAuth, discovery and MCP mounts keep it because the tenant API serves
 * them under those exact paths.
 */

const COMMERCE_INTERNAL_URL = process.env.COMMERCE_INTERNAL_URL ?? "http://127.0.0.1:3001";

const TENANT_INTERNAL_URL = process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002";

// Hop-by-hop headers (RFC 9110 §7.6.1) describe one connection, so forwarding
// them would describe the wrong hop. `proxy-*` is connection-scoped too.
const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade"];

// Written by `src/server.ts` from the resolved host, never by the client. The
// client's copy is dropped here too, so an upstream only ever sees the values
// host resolution produced — even if a caller forgets to sanitize first.
const RESOLVED_HOST_HEADERS = ["x-menuza-tenant-id", "x-menuza-mode", "x-menuza-host"];

/** The host verdict `src/server.ts` resolved for this request. */
export interface ResolvedHost {
  mode: string;
  host: string;
  tenantId: string | null;
}

interface Upstream {
  origin: string;
  pathname: string;
}

// The mounts that Next rewrote to the upstream root: `/commerce/x` → `/x`.
const STRIPPED_MOUNTS = [
  { mount: "/commerce", origin: COMMERCE_INTERNAL_URL },
  { mount: "/tenant", origin: TENANT_INTERNAL_URL },
] as const;

// Served under the same path upstream. `/oauth/token` and `/oauth/revoke` are
// plain routes in Next, not the whole `/oauth/*` tree.
const PASSTHROUGH_PATHS = new Set([
  "/oauth/token",
  "/oauth/revoke",
  "/.well-known/oauth-authorization-server",
]);

/** Upstream path for a mount that Next rewrote away (`/commerce/x` → `/x`). */
function stripMount(pathname: string, mount: string): string {
  const rest = pathname.slice(mount.length);

  return rest === "" ? "/" : rest;
}

/** The upstream that serves `pathname`, or `null` when no mount matches. */
function matchUpstream(pathname: string): Upstream | null {
  for (const { mount, origin } of STRIPPED_MOUNTS) {
    if (pathname === mount || pathname.startsWith(`${mount}/`)) {
      return { origin, pathname: stripMount(pathname, mount) };
    }
  }

  if (PASSTHROUGH_PATHS.has(pathname)) return { origin: TENANT_INTERNAL_URL, pathname };

  // Next splits this into `/mcp` + `/mcp/:path*`; one check covers both.
  if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
    return { origin: TENANT_INTERNAL_URL, pathname };
  }

  // Next: `/webhooks/:path*` — the bare mount is not a route.
  if (pathname.startsWith("/webhooks/")) {
    return { origin: COMMERCE_INTERNAL_URL, pathname: stripMount(pathname, "/webhooks") };
  }

  return null;
}

/**
 * The client headers minus the ones that belong to this hop and the resolved
 * host headers, plus the resolved values `src/server.ts` computed and the
 * forwarded origin/protocol the APIs use to build absolute redirect URLs (see
 * `apps/tenant/src/oauth.ts`).
 */
function upstreamHeaders(request: Request, url: URL, resolved: ResolvedHost): Headers {
  const headers = new Headers();

  for (const [name, value] of request.headers) {
    if (name === "host" || HOP_BY_HOP.includes(name) || name.startsWith("proxy-")) continue;

    if (RESOLVED_HOST_HEADERS.includes(name)) continue;

    headers.append(name, value);
  }

  headers.set("x-menuza-mode", resolved.mode);
  headers.set("x-menuza-host", resolved.host);

  if (resolved.tenantId !== null) headers.set("x-menuza-tenant-id", resolved.tenantId);

  const host = request.headers.get("host");

  if (host) headers.set("x-forwarded-host", host);

  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  return headers;
}

/**
 * Proxies one request to its upstream service and returns the response as-is
 * (status, headers and streaming body). Returns `null` when no API mount
 * matches, so the caller continues with the app.
 */
export async function proxyUpstream(
  request: Request,
  resolved: ResolvedHost,
): Promise<Response | null> {
  const url = new URL(request.url);
  const upstream = matchUpstream(url.pathname);

  if (!upstream) return null;

  const target = new URL(upstream.pathname, upstream.origin);

  target.search = url.search;

  const init: RequestInit = {
    method: request.method,
    headers: upstreamHeaders(request, url, resolved),
    // A proxy passes redirects through instead of chasing them: a `Location`
    // the API emits for the app origin must keep pointing at the app origin.
    redirect: "manual",
  };

  // A stream would need the `duplex: "half"` option, which the DOM `RequestInit`
  // types refuse, so the body is buffered: these payloads are small JSON posts.
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  try {
    return await fetch(target, init);
  } catch {
    return new Response("Upstream indisponível.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
