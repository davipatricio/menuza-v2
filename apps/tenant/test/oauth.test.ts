import { describe, expect, test } from "bun:test";
import { handleOAuthRequest } from "../src/oauth.ts";

describe("Tenant API OAuth Handlers — Unit/Integration", () => {
  test("GET /.well-known/oauth-authorization-server returns RFC 8414 metadata", async () => {
    const req = new Request("http://127.0.0.1:3002/.well-known/oauth-authorization-server", {
      method: "GET",
    });

    const res = await handleOAuthRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);

    const json = await res?.json();
    expect(json.issuer).toBe("http://127.0.0.1:3002");
    expect(json.authorization_endpoint).toBe("http://127.0.0.1:3002/oauth/authorize");
    expect(json.token_endpoint).toBe("http://127.0.0.1:3002/oauth/token");
    expect(json.revocation_endpoint).toBe("http://127.0.0.1:3002/oauth/revoke");
    expect(json.response_types_supported).toEqual(["code"]);
    expect(json.code_challenge_methods_supported).toEqual(["S256"]);
    expect(json.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });

  test("OPTIONS /.well-known/oauth-authorization-server returns 204 with CORS headers", async () => {
    const req = new Request("http://127.0.0.1:3002/.well-known/oauth-authorization-server", {
      method: "OPTIONS",
    });

    const res = await handleOAuthRequest(req);
    expect(res?.status).toBe(204);
    expect(res?.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("POST /oauth/token rejects unsupported grant_type", async () => {
    const req = new Request("http://127.0.0.1:3002/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials" }),
    });

    const res = await handleOAuthRequest(req);
    expect(res?.status).toBe(400);
    const json = await res?.json();
    expect(json.error).toBe("unsupported_grant_type");
  });

  test("POST /oauth/token rejects missing parameters", async () => {
    const req = new Request("http://127.0.0.1:3002/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code" }),
    });

    const res = await handleOAuthRequest(req);
    expect(res?.status).toBe(400);
    const json = await res?.json();
    expect(json.error).toBe("invalid_request");
  });

  test("metadata advertises the forwarded public origin when trusted hops are declared", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";

    try {
      const req = new Request("http://127.0.0.1:3002/.well-known/oauth-authorization-server", {
        method: "GET",
        headers: {
          "x-forwarded-host": "app.menuza.com",
          "x-forwarded-proto": "https",
        },
      });

      const res = await handleOAuthRequest(req);
      const json = await res?.json();

      // A remote client must be told the address it can actually reach.
      expect(json.issuer).toBe("https://app.menuza.com");
      expect(json.token_endpoint).toBe("https://app.menuza.com/oauth/token");
    } finally {
      delete process.env.TRUSTED_PROXY_HOPS;
    }
  });

  test("metadata ignores forwarded headers when no trusted hop is declared", async () => {
    delete process.env.TRUSTED_PROXY_HOPS;

    const req = new Request("http://127.0.0.1:3002/.well-known/oauth-authorization-server", {
      method: "GET",
      headers: {
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    });

    const res = await handleOAuthRequest(req);
    const json = await res?.json();

    // A direct caller must not be able to forge its way into the document.
    expect(json.issuer).toBe("http://127.0.0.1:3002");
  });

  test("POST /oauth/authorize rejects unauthenticated request", async () => {
    const req = new Request("http://127.0.0.1:3002/oauth/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: "test-app",
        redirectUri: "http://localhost:8080/callback",
        codeChallenge: "challenge-123",
      }),
    });

    const res = await handleOAuthRequest(req);
    expect(res?.status).toBe(401);
    const json = await res?.json();
    expect(json.error).toBe("unauthorized");
  });
});
