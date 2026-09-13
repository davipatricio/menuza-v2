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
import { onError as onRpcError } from "@orpc/server";
import { RequestHeadersPlugin } from "@orpc/server/plugins";
import { context, trace, type Tracer } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";
import { log, newRequestId, redactHeaders } from "./logging.ts";
import { isFourXxCode } from "@menuza/shared/errors";

export { log, newRequestId, redactHeaders };

export interface BuildOptions {
  service: string;
  tracer?: Tracer;
}

/** Structural view of the oRPC error passed to `onRpcError` interceptors. */
export interface OrpcError extends Error {
  /** oRPC error code, e.g. `UNAUTHORIZED`. Absent on non-oRPC throws. */
  readonly code?: string;
}

/** Second `onRpcError` argument: oRPC handler options. The per-request context
 *  (including `requestId`) lives here, NOT on the thrown error. */
interface InterceptorOptions {
  readonly context?: { readonly requestId?: string };
}

/** `onRpcError` callback args: the thrown error, then handler options. */
type InterceptorArgs = [error: unknown, options?: InterceptorOptions];

/** Read the thrown error positionally. */
function readInterceptorError(args: InterceptorArgs): OrpcError {
  const [error] = args;

  // SAFETY: oRPC forwards the thrown handler error unchanged as the first
  // positional argument. `OrpcError` only declares an optional `code`, so
  // reading through it cannot misinterpret the value.
  return error as OrpcError;
}

/** Read the request id from the interceptor's second argument. */
function readInterceptorRequestId(args: InterceptorArgs): string | undefined {
  return args[1]?.context?.requestId;
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

export function buildRpcFetch(router: Router<any, any>, opts: BuildOptions) {
  const tracer = opts.tracer ?? trace.getTracer(`@menuza/api-${opts.service}`);

  const onErrorInterceptor = (...args: InterceptorArgs): void => {
    reportRpcError(readInterceptorError(args), opts, readInterceptorRequestId(args));
  };

  const handler = new RPCHandler(router, {
    // RequestHeadersPlugin exposes `context.reqHeaders`; the tenant middleware
    // reads `x-menuza-tenant-id` from it. Without this plugin the header is
    // invisible and `require: "tenant"` always fails.
    plugins: [new RequestHeadersPlugin()],
    interceptors: [onRpcError(onErrorInterceptor)],
  });

  return async function fetch(request: Request, prefix: `/${string}`): Promise<Response> {
    const url = new URL(request.url);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    return context.with(
      trace.setSpan(context.active(), tracer.startSpan(`rpc ${request.method} ${url.pathname}`)),
      async () => {
        const span = trace.getActiveSpan();
        span?.setAttribute("service", opts.service);
        span?.setAttribute("request.id", requestId);

        log({
          requestId,
          msg: "request",
          service: opts.service,
          method: request.method,
          url: url.pathname,
          headers: redactHeaders(Object.fromEntries(request.headers)),
        });

        const { matched, response } = await handler.handle(request, {
          prefix,
          context: { requestId },
        });

        const finalResponse = matched ? response : new Response("Not Found", { status: 404 });

        log({ requestId, msg: "response", service: opts.service, status: finalResponse.status });
        span?.setAttribute("http.status_code", finalResponse.status);
        span?.end();

        // Echo the request id so the page can correlate when it logs.
        finalResponse.headers.set("x-request-id", requestId);

        return finalResponse;
      },
    );
  };
}
