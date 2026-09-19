/**
 * Side-effect-free observability helpers for the API processes.
 *
 * OpenTelemetry: the API tracer here is a no-op until a provider is
 * registered. The SDK/exporter bootstrap lives in `./otel.ts` (`initOtel`),
 * which stays off unless a collector endpoint is configured.
 *
 *
 * Sentry: imports `@sentry/bun`. When `SENTRY_DSN` is unset, `initSentry`
 * is a no-op and the SDK never sends data. No fake DSN is bundled.
 *
 * PII: `initSentry` locks `dataCollection` down and strips user/request/extra
 * payloads plus CPF/CNPJ/e-mail/phone patterns via the shared
 * `@menuza/shared/sentry-privacy` scrubber (LGPD).
 */
import { trace, type Tracer } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryPiiSafeDataCollection,
} from "@menuza/shared/sentry-privacy";

let sentryStarted = false;

export function initSentry(opts: { dsn?: string; service: string; release?: string }): void {
  if (sentryStarted) return;
  const dsn = opts.dsn ?? process.env.SENTRY_DSN;

  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    release: opts.release,
    serverName: opts.service,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? "development",
    dataCollection: sentryPiiSafeDataCollection,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  });
  sentryStarted = true;
}

export function getTracer(name = "@menuza/orpc-server"): Tracer {
  return trace.getTracer(name);
}

export { Sentry };
