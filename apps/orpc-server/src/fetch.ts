/**
 * Build a Fetch-compatible handler for an oRPC router.
 *
 * Per request:
 *  - Reuse the inbound `x-request-id` when present (so the SW drainer can
 *    correlate with the originating mutation); otherwise mint one.
 *  - Wrap the handler call in an OTel span (`@menuza/api-<service>`).
 *  - On RPC error: log + capture to Sentry if initialized.
 */
import { RPCHandler } from "@orpc/server/fetch";
import type { Router } from "@orpc/server";
import {
  PrototypePollutionProtectionHandlerPlugin,
  RequestHeadersHandlerPlugin,
  RequestLimitHandlerPlugin,
  TimeoutHandlerPlugin,
} from "@orpc/server/plugins";
import { SpanKind, context, trace, type Tracer } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";
import { log, newRequestId, redactHeaders } from "./logging.ts";
import { extractParentContext } from "./otel.ts";
import { isFourXxCode } from "@menuza/shared/errors";

export { log, newRequestId, redactHeaders };

export interface BuildOptions {
  service: string;
  tracer?: Tracer;
}

/** Structural view of the oRPC error passed to error interceptors. */
export interface OrpcError extends Error {
  /** oRPC error code, e.g. `UNAUTHORIZED`. Absent on non-oRPC throws. */
  readonly code?: string;
}

/**
 * Handle a single RPC error.
 *
 * Always logs. Captures to Sentry only for 5xx-classified errors
 * (`INTERNAL` and unknown codes); 4xx codes are client errors and stay out
 * of Sentry — re-labelling incidents later is expensive, so the split is
 * intentional and pinned by ADR-0004.
 *
 * Exported so the severity decision is unit-testable without a router.
 */
export function reportRpcError(error: OrpcError, opts: BuildOptions, requestId?: string): void {
  const { code } = error;

  log({
    requestId: requestId ?? crypto.randomUUID(),
    level: "error",
    msg: "rpc error",
    service: opts.service,
    code,
    err: String(error),
  });

  if (!isFourXxCode(code)) {
    // Capture the error so Sentry records it. requestId and code are attached
    // as tags so dashboards can filter per service/incident.
    Sentry.captureException(error, {
      tags: {
        service: opts.service,
        requestId: requestId ?? "missing",
        code: code ?? "unknown",
      },
    });
  }
}

export function buildRpcFetch(router: Router<any>, opts: BuildOptions) {
  const tracer = opts.tracer ?? trace.getTracer(`@menuza/api-${opts.service}`);

  // Object-style handler interceptor: runs only for matched requests. oRPC
  // forwards the thrown error unchanged; the per-request context (including
  // `requestId`) lives on the interceptor options, NOT on the thrown error.
  // SAFETY: `OrpcError` only declares an optional `code`, so casting the
  // unknown thrown value cannot misinterpret it.
  const handler = new RPCHandler(router, {
    // RequestHeadersHandlerPlugin exposes `context.reqHeaders`; the tenant
    // middleware reads `x-menuza-tenant-id` from it. Without this plugin the
    // header is invisible and `require: "tenant"` always fails.
    plugins: [
      new RequestHeadersHandlerPlugin(),
      new RequestLimitHandlerPlugin({ maxBodySize: 1024 * 1024 }),
      new TimeoutHandlerPlugin({ timeout: 30_000 }),
      new PrototypePollutionProtectionHandlerPlugin(),
    ],
    interceptors: [
      async ({ next, context }) => {
        try {
          return await next();
        } catch (error) {
          // SAFETY: oRPC forwards the thrown handler error unchanged. `OrpcError`
          // only declares an optional `code`, so this cast cannot misinterpret it.
          reportRpcError(error as OrpcError, opts, context?.requestId);
          throw error;
        }
      },
    ],
  });

  return async function fetch(request: Request, prefix: `/${string}`): Promise<Response> {
    const url = new URL(request.url);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    // Continue an upstream trace when `traceparent` is present; otherwise root
    // a new one.
    const parent = extractParentContext(request.headers);

    const span = tracer.startSpan(
      `rpc ${request.method} ${url.pathname}`,
      { kind: SpanKind.SERVER },
      parent,
    );

    return context.with(trace.setSpan(parent, span), async () => {
      span.setAttribute("service", opts.service);
      span.setAttribute("request.id", requestId);

      log({
        requestId,
        msg: "request",
        service: opts.service,
        method: request.method,
        url: url.pathname,
        headers: redactHeaders(Object.fromEntries(request.headers)),
      });

      try {
        const { matched, response } = await handler.handle(request, {
          prefix,
          context: { requestId },
        });

        const finalResponse = matched ? response : new Response("Not Found", { status: 404 });

        log({ requestId, msg: "response", service: opts.service, status: finalResponse.status });
        span.setAttribute("http.response.status_code", finalResponse.status);

        // Echo the request id so the page can correlate when it logs.
        finalResponse.headers.set("x-request-id", requestId);

        return finalResponse;
      } catch (error) {
        span.setAttribute("error.type", error instanceof Error ? error.name : "unknown");
        throw error;
      } finally {
        span.end();
      }
    });
  };
}
