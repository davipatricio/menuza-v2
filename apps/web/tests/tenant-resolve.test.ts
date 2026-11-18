import { describe, expect, test } from "bun:test";
import {
  normalizePeerIp,
  resolveHost,
  stripPort,
  trustedForwardedHost,
} from "../src/server/tenant-resolve.ts";

describe("tenant-resolve", () => {
  describe("stripPort", () => {
    test("strips port from IPv4 and domain authorities while preserving bracketed IPv6", () => {
      expect(stripPort("store.localhost:3003")).toBe("store.localhost");
      expect(stripPort("127.0.0.1:3003")).toBe("127.0.0.1");
      expect(stripPort("[::1]:3003")).toBe("[::1]");
      expect(stripPort("[::1]")).toBe("[::1]");
    });
  });

  describe("normalizePeerIp", () => {
    test("unwraps IPv4-mapped IPv6 addresses", () => {
      expect(normalizePeerIp("::ffff:127.0.0.1")).toBe("127.0.0.1");
      expect(normalizePeerIp("  10.0.0.5  ")).toBe("10.0.0.5");
      expect(normalizePeerIp(null)).toBe("");
    });
  });

  describe("trustedForwardedHost", () => {
    test("rejects spoofed x-forwarded-for when socket peer is untrusted or missing", () => {
      const spoofed = new Request("http://localhost:3003/store", {
        headers: {
          host: "localhost:3003",
          "x-forwarded-for": "10.0.0.1",
          "x-forwarded-host": "store.localhost",
        },
      });

      expect(trustedForwardedHost(spoofed, "203.0.113.99", 1, ["10.0.0.1"])).toBeNull();
      expect(trustedForwardedHost(spoofed, null, 1, ["10.0.0.1"])).toBeNull();
      expect(trustedForwardedHost(spoofed, "10.0.0.1", 0, ["10.0.0.1"])).toBeNull();
      expect(trustedForwardedHost(spoofed, "10.0.0.1", 1, [])).toBeNull();
    });

    test("honors x-forwarded-host from allowlisted IPv4 and IPv4-mapped IPv6 socket peer", () => {
      const proxied = new Request("http://127.0.0.1:3003/store", {
        headers: {
          host: "127.0.0.1:3003",
          "x-forwarded-host": "evil.example, store.localhost",
        },
      });

      expect(trustedForwardedHost(proxied, "::ffff:10.0.0.1", 1, ["10.0.0.1"])).toBe(
        "store.localhost",
      );
    });
  });

  describe("resolveHost", () => {
    test("resolves OAuth discovery on allowlisted host instead of bypassing proxyUpstream", async () => {
      const req = new Request("http://localhost:3003/.well-known/oauth-authorization-server", {
        headers: { host: "localhost:3003" },
      });

      const verdict = await resolveHost(req, null);
      expect(verdict).toEqual({ mode: "main", host: "localhost", tenantId: null });
    });

    test("denies unknown host on OAuth discovery", async () => {
      const req = new Request("http://evil.test/.well-known/oauth-authorization-server", {
        headers: { host: "evil.test" },
      });

      const verdict = await resolveHost(req, null);
      expect(verdict).toEqual({ deny: "unknown-host" });
    });

    test("keeps static infrastructure paths on the pass fast-path", async () => {
      const req = new Request("http://evil.test/favicon.ico", {
        headers: { host: "evil.test" },
      });

      const verdict = await resolveHost(req, null);
      expect(verdict).toEqual({ pass: true });
    });
  });
});
