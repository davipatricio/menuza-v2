import { describe, expect, test } from "bun:test";
import {
  PAGARME_BASE_URL,
  mapPagarMeEventType,
  pagarMeRequest,
  parsePagarMeCredentials,
  parsePagarMeEvent,
  verifyPagarMeAuthorization,
} from "../src/index.ts";

describe("@menuza/pagarme-api-client", () => {
  describe("parsePagarMeCredentials", () => {
    test("accepts valid secret key credentials", () => {
      const creds = parsePagarMeCredentials(JSON.stringify({ secretKey: "sk_test_12345" }));

      expect(creds.secretKey).toBe("sk_test_12345");
    });

    test("rejects public key or non-sk prefix", () => {
      expect(() => parsePagarMeCredentials(JSON.stringify({ secretKey: "pk_test_12345" }))).toThrow(
        "Malformed Pagar.me credentials",
      );
    });

    test("rejects malformed JSON or missing secretKey", () => {
      expect(() => parsePagarMeCredentials("not-json")).toThrow();
      expect(() => parsePagarMeCredentials(JSON.stringify({}))).toThrow(
        "Malformed Pagar.me credentials",
      );
    });
  });

  describe("verifyPagarMeAuthorization", () => {
    const secretKey = "sk_test_abcdef123";

    test("verifies valid Basic header", () => {
      const auth = Buffer.from(`${secretKey}:`).toString("base64");

      expect(verifyPagarMeAuthorization(`Basic ${auth}`, secretKey)).toBe(true);
    });

    test("rejects invalid key or non-Basic scheme", () => {
      const badAuth = Buffer.from("sk_test_wrong:").toString("base64");

      expect(verifyPagarMeAuthorization(`Basic ${badAuth}`, secretKey)).toBe(false);
      expect(verifyPagarMeAuthorization(`Bearer ${secretKey}`, secretKey)).toBe(false);
    });
  });

  describe("parsePagarMeEvent and mapPagarMeEventType", () => {
    test("parses webhook payload into PagarMeEvent", () => {
      const payload = JSON.stringify({
        id: "hook_123",
        type: "order.paid",
        data: {
          code: "ORDER-42",
          amount: 2500,
        },
      });

      const event = parsePagarMeEvent(payload);

      expect(event).toEqual({
        externalId: "hook_123",
        type: "order.paid",
        orderCode: "ORDER-42",
        amountCents: 2500,
      });
      expect(mapPagarMeEventType(event!.type)).toBe("paid");
    });

    test("returns null on malformed webhook body", () => {
      expect(parsePagarMeEvent("bad-json")).toBeNull();
      expect(parsePagarMeEvent(JSON.stringify({}))).toBeNull();
    });

    test("maps event types correctly", () => {
      expect(mapPagarMeEventType("charge.paid")).toBe("paid");
      expect(mapPagarMeEventType("order.payment_failed")).toBe("payment_failed");
      expect(mapPagarMeEventType("charge.payment_failed")).toBe("payment_failed");
      expect(mapPagarMeEventType("order.canceled")).toBe("ignored");
    });
  });

  describe("pagarMeRequest", () => {
    test("sends request with Basic auth and returns parsed JSON", async () => {
      const originalFetch = globalThis.fetch;
      let requestedUrl = "";
      let authHeader = "";

      // SAFETY: test mock assigns a compatible mock function to global fetch.
      globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(input);
        const headers = new Headers(init?.headers);
        authHeader = headers.get("authorization") ?? "";

        return new Response(JSON.stringify({ id: "or_123", status: "paid" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch;

      try {
        const res = await pagarMeRequest<{ id: string; status: string }>(
          { secretKey: "sk_test_secret" },
          "/orders",
          { method: "POST" },
        );

        expect(requestedUrl).toBe(`${PAGARME_BASE_URL}/orders`);
        const expectedAuth = Buffer.from("sk_test_secret:").toString("base64");

        expect(authHeader).toBe(`Basic ${expectedAuth}`);
        expect(res).toEqual({ id: "or_123", status: "paid" });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("throws on error response without leaking body", async () => {
      const originalFetch = globalThis.fetch;

      // SAFETY: test mock assigns an error-simulating mock function to global fetch.
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ message: "Sensitive card error" }), {
          status: 402,
        });
      }) as typeof fetch;

      try {
        await expect(pagarMeRequest({ secretKey: "sk_test_secret" }, "/charges")).rejects.toThrow(
          "Pagar.me request /charges failed with 402",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
