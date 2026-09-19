/**
 * Edge runtime Sentry init for Next (proxy/middleware). Mirrors the Node
 * config; the SDK no-ops without `SENTRY_DSN`.
 */
import * as Sentry from "@sentry/nextjs";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryPiiSafeDataCollection,
} from "@menuza/shared/sentry-privacy";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? "development",
  // 10% by default; set the rate to 0 to rely on OpenTelemetry tracing only.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  dataCollection: sentryPiiSafeDataCollection,
  beforeSend: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
});
