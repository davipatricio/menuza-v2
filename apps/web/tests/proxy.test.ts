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

type Mode = keyof typeof PREFIXES;

function isAlwaysAllowed(pathname: string): boolean {
  if (ALWAYS_ALLOW.includes(pathname)) return true;

  if (pathname.startsWith("/_next/")) return true;

  if (pathname.startsWith("/serwist/")) return true;

  return false;
}

function isAllowed(mode: Mode, pathname: string): boolean {
  if (pathname === "/") return true;
  const list = PREFIXES[mode];

  return list.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function resolveMode(host: string, storefrontHosts: Set<string>): Mode {
  return storefrontHosts.has(host) ? "storefront" : "main";
}

function resolveHost(
  forwardedHost: string | null,
  host: string | null,
  trustedIps: string[],
  forwardedFor: string | null,
  hops: number,
): string {
  if (trustedIps.length > 0 && hops > 0 && forwardedFor) {
    const remote = forwardedFor.split(",")[0]?.trim();

    if (remote && trustedIps.includes(remote) && hops <= 2) {
      if (forwardedHost) return forwardedHost.split(",")[0]!.trim().toLowerCase().split(":")[0]!;
    }
  }

  return (host ?? "").toLowerCase().split(":")[0]!;
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

  test("unknown hosts resolve to main (fail-open)", () => {
    const storefrontHosts = new Set(["store.localhost"]);

    expect(resolveMode("store.localhost", storefrontHosts)).toBe("storefront");
    expect(resolveMode("menuza.localhost", storefrontHosts)).toBe("main");
    expect(resolveMode("anything-else.example.com", storefrontHosts)).toBe("main");
  });

  test("trusted forwarding requires TRUSTED_PROXY_HOP_IPS", () => {
    const spoofed = "evil.example.com";
    const actual = "127.0.0.1";
    // Without trusted IPs, forwarded-host is ignored.
    const result = resolveHost(spoofed, actual, [], "1.2.3.4", 1);
    expect(result).toBe("127.0.0.1");
    // With trusted IPs and matching remote, forwarded-host wins.
    const result2 = resolveHost(spoofed, actual, ["1.2.3.4"], "1.2.3.4", 1);
    expect(result2).toBe("evil.example.com");
  });

  test("forwarded host from a non-trusted IP is ignored", () => {
    const result = resolveHost("evil.example.com", "127.0.0.1", ["10.0.0.1"], "1.2.3.4", 1);
    expect(result).toBe("127.0.0.1");
  });
});
