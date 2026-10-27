import { describe, expect, test } from "bun:test";
import type { PaymentJobPayload } from "@menuza/shared/commerce";
import { dispatchPaymentEvent } from "./payment-events.ts";

const PAYLOAD: PaymentJobPayload = { tenantId: "tenant-1", gatewayEventId: "event-1" };

describe("payment-events", () => {
  test("posts the event id inside the RPC envelope with both gates", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];

    await dispatchPaymentEvent(PAYLOAD, {
      origin: "http://127.0.0.1:3001",
      secret: "internal-secret",
      fetchFn: async (url, init) => {
        seen.push({ url, init });

        return new Response(null, { status: 200 });
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("http://127.0.0.1:3001/rpc/payments/applyGatewayEvent");

    const headers = seen[0]?.init.headers;

    // SAFETY: the call above always sets a plain object of headers.
    const sent = headers as Record<string, string>;

    expect(sent["x-menuza-internal-token"]).toBe("internal-secret");
    expect(sent["x-menuza-tenant-id"]).toBe("tenant-1");
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      json: { gatewayEventId: "event-1" },
    });
  });

  test("a non-2xx throws so BullMQ retries the job", async () => {
    expect(
      dispatchPaymentEvent(PAYLOAD, {
        fetchFn: async () => new Response(null, { status: 503 }),
      }),
    ).rejects.toThrow("503");
  });
});
