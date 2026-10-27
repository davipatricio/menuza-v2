import { describe, expect, test } from "bun:test";
import { PAYMENT_EVENTS_QUEUE, parsePaymentJobPayload, paymentEventJobId } from "./types.ts";

describe("payment job envelope", () => {
  test("parses a well-formed payload", () => {
    expect(parsePaymentJobPayload({ tenantId: "tenant-1", gatewayEventId: "event-1" })).toEqual({
      tenantId: "tenant-1",
      gatewayEventId: "event-1",
    });
  });

  test("rejects what Redis handed back malformed", () => {
    const missingId = JSON.parse('{"tenantId":"tenant-1"}');

    const blankTenant = JSON.parse('{"tenantId":"","gatewayEventId":"event-1"}');

    expect(() => parsePaymentJobPayload(missingId)).toThrow();
    expect(() => parsePaymentJobPayload(blankTenant)).toThrow();
  });

  test("the job id is deterministic per event", () => {
    expect(paymentEventJobId("event-1")).toBe(paymentEventJobId("event-1"));
    expect(paymentEventJobId("event-1")).not.toBe(paymentEventJobId("event-2"));
  });

  test("the queue name is stable", () => {
    expect(PAYMENT_EVENTS_QUEUE).toBe("payment-events");
  });
});
