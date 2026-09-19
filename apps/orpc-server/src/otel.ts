/**
 * OpenTelemetry tracing bootstrap for the API/worker processes.
 *
 * Importing this module has no side effects. `initOtel` is a no-op unless a
 * collector endpoint is configured through the standard `OTEL_EXPORTER_OTLP_*`
 * env vars — mirroring `initSentry`: no fake endpoint, no bundled collector.
 * The exporter reads its own endpoint/headers/compression from those env vars,
 * so this module only wires the provider, context manager, propagator, and the
 * outbound-fetch wrapper.
 */
import {
  SpanKind,
  context,
  propagation,
  trace,
  type TextMapGetter,
  type TextMapSetter,
} from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { log, newRequestId } from "./logging.ts";

/** Endpoint env vars that turn tracing on. The trace-specific one wins. */
const ENDPOINT_ENV = ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT"] as const;

type FetchArgs = Parameters<typeof globalThis.fetch>;

type FetchReturn = ReturnType<typeof globalThis.fetch>;

/** `Headers` is not indexable, so the API's default brace-access getter cannot read it. */
const headerGetter: TextMapGetter<Headers> = {
  keys: (carrier) => [...carrier.keys()],
  get: (carrier, key) => carrier.get(key) ?? undefined,
};

const headerSetter: TextMapSetter<Headers> = {
  set: (carrier, key, value) => {
    carrier.set(key, value);
  },
};

let provider: TracerProvider | undefined;

let originalFetch: typeof globalThis.fetch | undefined;

export interface InitOtelOptions {
  service: string;
}

/** The configured collector endpoint, if any. */
export function otelEndpoint(): string | undefined {
  for (const key of ENDPOINT_ENV) {
    const value = process.env[key];

    if (value) return value;
  }

  return undefined;
}

/**
 * Extract the inbound W3C trace context from request headers so a span started
 * for this request continues an upstream trace instead of rooting a new one.
 */
export function extractParentContext(headers: Headers) {
  return propagation.extract(context.active(), headers, headerGetter);
}

/**
 * Start the tracing SDK. Returns `false` (and stays a no-op) when no endpoint is
 * configured, so local processes emit nothing without an explicit opt-in.
 */
export function initOtel(opts: InitOtelOptions): boolean {
  if (provider) return true;

  if (!otelEndpoint()) return false;

  provider = new TracerProvider({
    resource: defaultResource().merge(resourceFromAttributes({ "service.name": opts.service })),
    spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
  });

  // Globals can only be registered once per process. If another SDK already
  // owns them (e.g. a Sentry tracing setup), keep that one — warn instead of
  // silently replacing it.
  const tracerRegistered = trace.setGlobalTracerProvider(provider);
  const contextRegistered = context.setGlobalContextManager(new AsyncLocalStorageContextManager());

  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  if (!tracerRegistered || !contextRegistered) {
    log({
      requestId: newRequestId(),
      level: "warn",
      msg: "otel globals already registered; keeping previous provider",
      service: opts.service,
    });
  }

  instrumentFetch();

  return true;
}

/** Flush pending spans and unwrap fetch. Safe to call more than once. */
export async function shutdownOtel(): Promise<void> {
  const current = provider;

  provider = undefined;
  unwrapFetch();

  await current?.shutdown().catch(() => {});
}

/** The tracer used for outbound fetch spans. Shared by the wrapper. */
const fetchTracer = () => trace.getTracer("@menuza/orpc-server/fetch");

function instrumentFetch(): void {
  if (originalFetch) return;

  const base = globalThis.fetch;

  originalFetch = base;

  // `Object.assign` carries Bun's optional `preconnect` hook across so the
  // wrapper keeps the full `typeof fetch` shape without an assertion.
  const wrapped = Object.assign(
    async (...args: FetchArgs): FetchReturn => {
      const parent = trace.getActiveSpan();

      // No active span means no trace to extend; don't create roots for
      // background/startup traffic.
      if (!parent) return base(...args);

      const [input, init] = args;

      const method = (
        input instanceof Request ? input.method : (init?.method ?? "GET")
      ).toUpperCase();

      const url = input instanceof Request ? input.url : String(input);

      const span = fetchTracer().startSpan(
        `fetch ${method}`,
        {
          kind: SpanKind.CLIENT,
          attributes: { "http.request.method": method, "url.full": url },
        },
        trace.setSpan(context.active(), parent),
      );

      try {
        const response = await base(...injectTraceparent(input, init));

        span.setAttribute("http.response.status_code", response.status);

        return response;
      } catch (error) {
        span.setAttribute("error.type", error instanceof Error ? error.name : "unknown");
        throw error;
      } finally {
        span.end();
      }
    },
    { preconnect: base.preconnect },
  );

  globalThis.fetch = wrapped;
}

function unwrapFetch(): void {
  if (!originalFetch) return;

  globalThis.fetch = originalFetch;
  originalFetch = undefined;
}

/** Copy the outbound request with a `traceparent` header added. */
function injectTraceparent(input: FetchArgs[0], init: FetchArgs[1]): FetchArgs {
  const headers = new Headers(input instanceof Request ? input.headers : init?.headers);

  propagation.inject(context.active(), headers, headerSetter);

  if (input instanceof Request) {
    try {
      return [new Request(input, { ...init, headers }), undefined];
    } catch {
      // The body was already consumed or is otherwise uncloneable; send the
      // original request rather than failing the call over telemetry.
      return [input, init];
    }
  }

  return [input, { ...init, headers }];
}
