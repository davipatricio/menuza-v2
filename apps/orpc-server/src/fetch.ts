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

export function buildRpcFetch(router: Router<any, any>, opts: BuildOptions) {
  const tracer = opts.tracer ?? trace.getTracer(`@menuza/api-${opts.service}`);

  const handler = new RPCHandler(router, {
    interceptors: [
      onRpcError((error) => {
        const requestId = (error as { context?: { requestId?: string } } | undefined)?.context
          ?.requestId;

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
      }),
    ],
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
