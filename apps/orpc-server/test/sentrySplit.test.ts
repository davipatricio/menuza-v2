import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { OrpcError } from "../src/fetch.ts";

// Mock before importing the module under test so the interceptor binds the spy.
const captureException = mock(() => undefined);

mock.module("@sentry/bun", () => ({
  captureException,
  init: mock(() => undefined),
}));

const { reportRpcError } = await import("../src/fetch.ts");

function fakeOrpcError(code: string): OrpcError {
  return Object.assign(new Error(`rpc failed: ${code}`), { code });
}

describe("reportRpcError — Sentry split", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  test("does NOT capture 4xx-classified codes", () => {
    reportRpcError(fakeOrpcError("UNAUTHORIZED"), { service: "commerce" });

    expect(captureException).not.toHaveBeenCalled();
  });

  test("captures 5xx-classified codes with a code tag", () => {
    reportRpcError(fakeOrpcError("INTERNAL"), { service: "tenant" });

    expect(captureException).toHaveBeenCalledTimes(1);

    // SAFETY: the mock has a single call site (above) and `reportRpcError`
    // always passes an Error plus an options object with `tags`.
    const [error, context] = captureException.mock.calls[0] as [
      Error,
      { tags?: Record<string, string> },
    ];

    expect(error).toBeInstanceOf(Error);
    expect(context.tags?.code).toBe("INTERNAL");
    expect(context.tags?.service).toBe("tenant");
  });

  test("captures unknown codes as 5xx with a fallback tag", () => {
    reportRpcError(fakeOrpcError("FOO"), { service: "commerce" });

    expect(captureException).toHaveBeenCalledTimes(1);

    // SAFETY: the mock has a single call site (above) and `reportRpcError`
    // always passes an Error plus an options object with `tags`.
    const [, context] = captureException.mock.calls[0] as [
      unknown,
      { tags?: Record<string, string> },
    ];

    expect(context.tags?.code).toBe("FOO");
  });

  test("uses the interceptor requestId when provided", () => {
    reportRpcError(fakeOrpcError("INTERNAL"), { service: "tenant" }, "rid-123");

    expect(captureException).toHaveBeenCalledTimes(1);

    // SAFETY: the mock has a single call site (above) and `reportRpcError`
    // always passes an Error plus an options object with `tags`.
    const [error, context] = captureException.mock.calls[0] as [
      Error,
      { tags?: Record<string, string> },
    ];

    expect(context.tags?.requestId).toBe("rid-123");
    expect(error).toBeInstanceOf(Error);
  });

  test("falls back to 'missing' when no requestId is provided", () => {
    reportRpcError(fakeOrpcError("INTERNAL"), { service: "tenant" });

    expect(captureException).toHaveBeenCalledTimes(1);

    // SAFETY: the mock has a single call site (above) and `reportRpcError`
    // always passes an Error plus an options object with `tags`.
    const [, context] = captureException.mock.calls[0] as [
      unknown,
      { tags?: Record<string, string> },
    ];

    expect(context.tags?.requestId).toBe("missing");
  });
});
