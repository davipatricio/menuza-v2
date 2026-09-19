import { expect, test } from "bun:test";

import {
  ROOT_CONTEXT,
  SpanStatusCode,
  context,
  trace,
  type AttributeValue,
  type Context,
  type Span,
  type Tracer,
} from "@opentelemetry/api";

import { otelQueryMiddleware } from "../src/otel-middleware.ts";

// The middleware gates on `trace.getActiveSpan()`, so the test needs a context
// manager that actually stores the active context. A synchronous one is enough;
// nothing here awaits inside `withActiveSpan`.
let current: Context = ROOT_CONTEXT;

const manager = {
  active: () => current,
  with: (ctx: Context, fn: () => void) => {
    const previous = current;

    current = ctx;

    try {
      fn();
    } finally {
      current = previous;
    }
  },
  bind: <T>(_ctx: Context, target: T) => target,
  enable: () => manager,
  disable: () => manager,
};

context.setGlobalContextManager(manager);

interface Recorded {
  name: string;
  attributes: Record<string, AttributeValue>;
  status?: { code: number };
  ended: boolean;
}

function fakeTracer(recorded: Recorded[]): Tracer {
  // SAFETY: the middleware only calls `startSpan` and the three span methods
  // exercised below; the rest of the `Tracer`/`Span` surface is never reached.
  return {
    startSpan: (name: string) => {
      const entry: Recorded = { name, attributes: {}, ended: false };

      recorded.push(entry);

      return {
        setAttribute: (key: string, value: AttributeValue) => {
          entry.attributes[key] = value;
        },
        setStatus: (status: { code: number }) => {
          entry.status = status;
        },
        end: () => {
          entry.ended = true;
        },
      };
    },
  } as Tracer;
}

function parentSpan(): Span {
  // SAFETY: `trace.setSpan` only stores the span object and `getActiveSpan`
  // returns it untested; no other `Span` member is touched in this test.
  return {
    spanContext: () => ({ traceId: "0".repeat(32), spanId: "1".repeat(16), traceFlags: 1 }),
  } as Span;
}

function withActiveSpan<T>(fn: () => T): T {
  return context.with(trace.setSpan(context.active(), parentSpan()), fn);
}

test("starts and ends one span per query", () => {
  const recorded: Recorded[] = [];
  const middleware = otelQueryMiddleware(fakeTracer(recorded));

  withActiveSpan(() => {
    middleware.beforeQuery?.({ sql: "SELECT id FROM tenant" }, { planExecutionId: "p1" });
    middleware.afterQuery?.(
      { sql: "SELECT id FROM tenant" },
      { rowCount: 3, completed: true, source: "driver" },
      { planExecutionId: "p1" },
    );
  });

  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.name).toBe("db SELECT");
  expect(recorded[0]?.attributes["db.response.returned_rows"]).toBe(3);
  expect(recorded[0]?.ended).toBe(true);
});

test("does nothing without an active span", () => {
  const recorded: Recorded[] = [];
  const middleware = otelQueryMiddleware(fakeTracer(recorded));

  middleware.beforeQuery?.({ sql: "SELECT 1" }, { planExecutionId: "p2" });
  middleware.afterQuery?.(
    { sql: "SELECT 1" },
    { rowCount: 0, completed: true, source: "driver" },
    { planExecutionId: "p2" },
  );

  expect(recorded).toHaveLength(0);
});

test("marks an incomplete query as an error", () => {
  const recorded: Recorded[] = [];
  const middleware = otelQueryMiddleware(fakeTracer(recorded));

  withActiveSpan(() => {
    middleware.beforeQuery?.({ sql: "SELECT 1" }, { planExecutionId: "p3" });
    middleware.afterQuery?.(
      { sql: "SELECT 1" },
      { rowCount: 0, completed: false, source: "middleware" },
      { planExecutionId: "p3" },
    );
  });

  expect(recorded[0]?.status?.code).toBe(SpanStatusCode.ERROR);
});

test("detaches the abort listener once the query completes", () => {
  const recorded: Recorded[] = [];
  const middleware = otelQueryMiddleware(fakeTracer(recorded));

  let added = 0;
  let removed = 0;

  const signal: Pick<AbortSignal, "aborted" | "addEventListener" | "removeEventListener"> = {
    aborted: false,
    addEventListener: () => {
      added += 1;
    },
    removeEventListener: () => {
      removed += 1;
    },
  };

  // SAFETY: the middleware only reads `planExecutionId` and calls the signal's
  // listener methods; `signal` carries exactly those members.
  const ctx = { planExecutionId: "p4", signal: signal as AbortSignal };

  withActiveSpan(() => {
    middleware.beforeQuery?.({ sql: "SELECT 1" }, ctx);
    middleware.afterQuery?.(
      { sql: "SELECT 1" },
      { rowCount: 0, completed: true, source: "driver" },
      ctx,
    );
  });

  expect(added).toBe(1);
  expect(removed).toBe(1);
  expect(recorded[0]?.ended).toBe(true);
});
