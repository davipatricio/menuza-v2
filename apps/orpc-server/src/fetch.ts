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
import { context, trace, type Tracer } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";
import { log, newRequestId, redactHeaders } from "./logging.ts";

export { log, newRequestId, redactHeaders };

export interface BuildOptions {
  service: string;
  tracer?: Tracer;
}

/** Shape oRPC attaches to errors thrown inside a handler: the per-request context. */
export interface RpcErrorContext {
  readonly context?: { readonly requestId?: string };
}

/** Structural view of the oRPC error passed to `onRpcError` interceptors. */
export interface OrpcError extends Error, Partial<RpcErrorContext> {}

/** Read the request id oRPC injects via `context: { requestId }` (see `handler.handle` below). */
function readErrorRequestId(error: OrpcError): string | undefined {
  return error.context?.requestId;
}

/** First argument of the `onRpcError` callback: the thrown RPC error, followed
 *  by the interceptor options oRPC passes positionally. The handler declares
 *  the error as the library's `unknown` type; the narrower `OrpcError` shape
 *  is read inside via `readInterceptorError` after the callback runs. */
type InterceptorArgs = [error: unknown, ...rest: unknown[]];

/** Read the thrown error from the interceptor arguments. `onRpcError` passes
 *  the thrown value positionally; only the `context` object oRPC attaches
 *  (see `handler.handle` below) is read later via `readErrorRequestId`. */
function readInterceptorError(args: InterceptorArgs): OrpcError {
  const [error] = args;

  // SAFETY: oRPC forwards the thrown handler error unchanged as the first
  // positional argument. The `OrpcError` interface only declares the optional
  // `context` object, so reading through it cannot misinterpret the value;
  // anything without a context yields `undefined` in `readErrorRequestId`.
  return error as OrpcError;
}

export function buildRpcFetch(router: Router<any, any>, opts: BuildOptions) {
  const tracer = opts.tracer ?? trace.getTracer(`@menuza/api-${opts.service}`);

  const onErrorInterceptor = (...args: InterceptorArgs): void => {
    const error = readInterceptorError(args);

    const requestId = readErrorRequestId(error);

    log({
      requestId: requestId ?? crypto.randomUUID(),
      level: "error",
      msg: "rpc error",
      service: opts.service,
      err: String(error),
    });
    // Capture the error so Sentry records it. requestId is included as a tag.
    Sentry.captureException(error, {
      tags: { service: opts.service, requestId: requestId ?? "missing" },
    });
  };

  const handler = new RPCHandler(router, {
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
