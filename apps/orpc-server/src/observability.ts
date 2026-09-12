/**
 * Side-effect-free observability helpers for the API processes.
 *
 * OpenTelemetry: imports `@opentelemetry/api` only. No SDK, no exporter.
 * The tracer is a no-op until an exporter is registered by the consumer.
 *
 * Sentry: imports `@sentry/bun`. When `SENTRY_DSN` is unset, `initSentry`
 * is a no-op and the SDK never sends data. No fake DSN is bundled.
 */
import { trace, type Tracer } from "@opentelemetry/api";
import * as Sentry from "@sentry/bun";

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
  });
  sentryStarted = true;
}

export function getTracer(name = "@menuza/orpc-server"): Tracer {
  return trace.getTracer(name);
}

export { Sentry };
