import { afterEach, describe, expect, test } from "bun:test";

import { context, propagation, trace, type Span, type TextMapPropagator } from "@opentelemetry/api";

import { injectSpanContext, initOtel, otelEndpoint } from "../src/otel.ts";

const ENDPOINTS = ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] as const;

const saved = new Map<string, string | undefined>();

function setEnv(key: string, value?: string): void {
  if (!saved.has(key)) saved.set(key, process.env[key]);

  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function fakeSpan(spanId: string): Span {
  // SAFETY: `injectSpanContext` only reads `spanContext()`.
  return {
    spanContext: () => ({ traceId: "0".repeat(32), spanId, traceFlags: 1 }),
  } as Span;
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  saved.clear();
});

describe("otelEndpoint", () => {
  test("is undefined when nothing is configured", () => {
    for (const key of ENDPOINTS) setEnv(key, undefined);

    expect(otelEndpoint()).toBeUndefined();
  });

  test("reads the base endpoint", () => {
    for (const key of ENDPOINTS) setEnv(key, undefined);

    setEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://collector:4318");

    expect(otelEndpoint()).toBe("http://collector:4318");
  });

  test("prefers the traces-specific endpoint", () => {
    setEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://base:4318");
    setEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "http://traces:4318/v1/traces");

    expect(otelEndpoint()).toBe("http://traces:4318/v1/traces");
  });
});

describe("initOtel", () => {
  test("is a no-op without an endpoint", () => {
    for (const key of ENDPOINTS) setEnv(key, undefined);

    expect(initOtel({ service: "test" })).toBe(false);
  });
});

describe("injectSpanContext", () => {
  test("injects the given span's context, not the active one", () => {
    const seen: string[] = [];

    const recording: TextMapPropagator = {
      inject: (ctx, carrier, setter) => {
        seen.push(trace.getSpan(ctx)?.spanContext().spanId ?? "none");
        setter.set(carrier, "traceparent", "x");
      },
      extract: (_ctx, _carrier, _getter) => context.active(),
      fields: () => ["traceparent"],
    };

    propagation.setGlobalPropagator(recording);

    const carrier = new Headers();

    injectSpanContext(carrier, fakeSpan("fetch-span-id"));

    expect(seen).toEqual(["fetch-span-id"]);
    expect(carrier.get("traceparent")).toBe("x");
  });
});
