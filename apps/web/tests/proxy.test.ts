/**
 * Host proxy tests. Run under `bun test`. These verify the host-mode
 * resolution and trusted-forwarding rules without booting Next.
 */
import { describe, expect, test } from "bun:test";

// Re-implement the same logic as `apps/web/src/proxy.ts` for unit testing without
// importing Next-specific types. The production file remains the source of
// truth; this re-implementation must be kept in sync.
const ALWAYS_ALLOW = ["/serwist", "/manifest.webmanifest", "/favicon.ico"];

const PREFIXES = {
  main: ["/about", "/pricing", "/contact", "/dashboard"],
  storefront: ["/store", "/menu", "/cart", "/checkout"],
} as const;

// Mirrors `API_PREFIXES` in `proxy.ts`: same-origin API mounts rewritten to the
// loopback services by next.config.ts, reachable in every mode.
const API_PREFIXES = ["/commerce", "/tenant"] as const;

type Mode = keyof typeof PREFIXES;

// Mirrors `DEV_HOSTS` in `proxy.ts`: main only outside production.
const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isAlwaysAllowed(pathname: string): boolean {
  if (ALWAYS_ALLOW.includes(pathname)) return true;

  if (pathname.startsWith("/_next/")) return true;

  if (pathname.startsWith("/serwist/")) return true;

  return false;
}

function isAllowed(mode: Mode, pathname: string): boolean {
  if (pathname === "/") return true;
  const list = [...PREFIXES[mode], ...API_PREFIXES];

  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function resolveMode(
  host: string,
  storefrontHosts: Set<string>,
  mainDomain: string,
  isProduction: boolean,
): Mode | null {
  if (storefrontHosts.has(host)) return "storefront";

  if (mainDomain && host === mainDomain) return "main";

  if (!isProduction && DEV_HOSTS.has(host)) return "main";

  return null;
}

// Mirrors `stripPort` in `proxy.ts`: drop a trailing `:port`, except keeping a
// bracketed IPv6 literal intact (its own colons would otherwise truncate it).
function stripPort(value: string): string {
  const bracketed = /^\[([^\]]+)\]/.exec(value);

  if (bracketed) return `[${bracketed[1]!}]`;

  const colon = value.indexOf(":");

  return colon === -1 ? value : value.slice(0, colon);
}

function resolveHost(
  forwardedHost: string | null,
  host: string | null,
  trustedIps: string[],
  trustedHops: number,
  forwardedFor: string | null,
): string {
  // Mirrors `resolveHost` in `proxy.ts`, including its gate: forwarded-host is
  // honoured only when both a hop limit and an IP allowlist are configured, the
  // remote address is trusted, and the forwarding chain is short enough. The
  // hop count is derived from the chain, as the source does — passing it in
  // would let the test assert a state the real parser cannot produce.
  if (trustedHops > 0 && trustedIps.length > 0) {
    const remote = forwardedFor?.split(",")[0]?.trim();
    const hops = forwardedFor ? Math.max(0, forwardedFor.split(",").length - 1) : 0;

    if (remote && trustedIps.includes(remote) && hops <= trustedHops) {
      const fwd = forwardedHost?.split(",")[0]?.trim().toLowerCase();

      if (fwd) return stripPort(fwd);
    }
  }

  return stripPort((host ?? "").toLowerCase());
}

describe("proxy logic", () => {
  test("isAlwaysAllowed covers service worker", () => {
    expect(isAlwaysAllowed("/serwist/sw.js")).toBe(true);
    expect(isAlwaysAllowed("/manifest.webmanifest")).toBe(true);
    expect(isAlwaysAllowed("/_next/static/chunks/main.js")).toBe(true);
    expect(isAlwaysAllowed("/api/foo")).toBe(false);
  });

  test("isAllowed root is permitted in every mode", () => {
    // SAFETY: the array literal is a closed set of the two known `Mode`
    // values, so the assertion covers exactly the union members.
    for (const m of ["main", "storefront"] as Mode[]) {
      expect(isAllowed(m, "/")).toBe(true);
    }
  });

  test("main reaches marketing and dashboard paths", () => {
    expect(isAllowed("main", "/about")).toBe(true);
    expect(isAllowed("main", "/dashboard")).toBe(true);
    expect(isAllowed("main", "/dashboard/mawifoods/orders")).toBe(true);
  });

  test("main cannot reach storefront paths", () => {
    expect(isAllowed("main", "/store")).toBe(false);
    expect(isAllowed("main", "/cart")).toBe(false);
  });

  test("storefront reaches store paths but not dashboard or marketing", () => {
    expect(isAllowed("storefront", "/store")).toBe(true);
    expect(isAllowed("storefront", "/menu/pizza")).toBe(true);
    expect(isAllowed("storefront", "/dashboard")).toBe(false);
    expect(isAllowed("storefront", "/dashboard/mawifoods")).toBe(false);
    expect(isAllowed("storefront", "/about")).toBe(false);
  });

  test("same-origin API mounts are reachable in every mode", () => {
    // SAFETY: the array literal is a closed set of the two known `Mode`
    // values, so the assertion covers exactly the union members.
    for (const m of ["main", "storefront"] as Mode[]) {
      expect(isAllowed(m, "/tenant/rpc/session/login")).toBe(true);
      expect(isAllowed(m, "/tenant/openapi/session/current")).toBe(true);
      expect(isAllowed(m, "/commerce/rpc")).toBe(true);
      expect(isAllowed(m, "/commerce/openapi/health")).toBe(true);
    }
  });

  test("storefront host resolves to storefront", () => {
    const storefrontHosts = new Set(["store.localhost"]);

    expect(resolveMode("store.localhost", storefrontHosts, "menuza.localhost", false)).toBe(
      "storefront",
    );
  });

  test("WEB_MAIN_DOMAIN resolves to main", () => {
    expect(resolveMode("menuza.localhost", new Set(), "menuza.localhost", false)).toBe("main");
  });

  test("dev hosts resolve to main outside production", () => {
    expect(resolveMode("localhost", new Set(), "menuza.localhost", false)).toBe("main");
    expect(resolveMode("127.0.0.1", new Set(), "menuza.localhost", false)).toBe("main");
    expect(resolveMode("[::1]", new Set(), "menuza.localhost", false)).toBe("main");
  });

  test("dev hosts are denied in production", () => {
    expect(resolveMode("localhost", new Set(), "menuza.localhost", true)).toBeNull();
    expect(resolveMode("127.0.0.1", new Set(), "menuza.localhost", true)).toBeNull();
  });

  test("unset WEB_MAIN_DOMAIN denies a non-dev host", () => {
    expect(resolveMode("menuza.localhost", new Set(), "", true)).toBeNull();
  });

  test("unknown hosts resolve to null (deny by default)", () => {
    const storefrontHosts = new Set(["store.localhost"]);

    expect(
      resolveMode("anything-else.example.com", storefrontHosts, "menuza.localhost", false),
    ).toBeNull();
  });

  test("trusted forwarding requires TRUSTED_PROXY_HOP_IPS", () => {
    const spoofed = "evil.example.com";
    const actual = "127.0.0.1";
    // Without trusted IPs, forwarded-host is ignored.
    const result = resolveHost(spoofed, actual, [], 1, "1.2.3.4");
    expect(result).toBe("127.0.0.1");
    // With trusted IPs and matching remote, forwarded-host wins.
    const result2 = resolveHost(spoofed, actual, ["1.2.3.4"], 1, "1.2.3.4");
    expect(result2).toBe("evil.example.com");
  });

  test("forwarded host from a non-trusted IP is ignored", () => {
    const result = resolveHost("evil.example.com", "127.0.0.1", ["10.0.0.1"], 1, "1.2.3.4");
    expect(result).toBe("127.0.0.1");
  });

  test("forwarded host honours the trusted hop limit", () => {
    // A single-entry chain is zero hops; this one carries one proxy hop.
    const chain = "1.2.3.4, 10.0.0.1";

    expect(resolveHost("evil.example.com", "127.0.0.1", ["1.2.3.4"], 1, chain)).toBe(
      "evil.example.com",
    );
    expect(resolveHost("evil.example.com", "127.0.0.1", ["1.2.3.4"], 0, chain)).toBe("127.0.0.1");
  });

  test("a port is stripped without truncating a bracketed IPv6 host", () => {
    expect(resolveHost(null, "127.0.0.1:3000", [], 0, null)).toBe("127.0.0.1");
    expect(resolveHost(null, "menuza.localhost:3000", [], 0, null)).toBe("menuza.localhost");
    expect(resolveHost(null, "[::1]:3000", [], 0, null)).toBe("[::1]");
    // The normalized value must hit the development allowlist in dev.
    expect(resolveMode("[::1]", new Set(), "menuza.localhost", false)).toBe("main");
  });
});
