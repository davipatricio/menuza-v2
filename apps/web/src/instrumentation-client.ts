/**
 * Browser Sentry init. Next injects this before hydration, so it must stay
 * lightweight and side-effect only.
 *
 * The DSN is public by design (it always ships in the client bundle); the
 * `NEXT_PUBLIC_SENTRY_DSN` name matches Next's inlining rule. Without it,
 * `init` disables the client — no fake DSN.
 *
 * PII: shared LGPD lock-down (`dataCollection` + `beforeSend` scrubber).
 *
 * `captureRouterTransitionStart` is imported by name (rather than off the
 * namespace) because oxlint does not follow the SDK's `export *` re-export of
 * this client-only symbol.
 */
import { captureRouterTransitionStart, init } from "@sentry/nextjs";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryPiiSafeDataCollection,
} from "@menuza/shared/sentry-privacy";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
  // 10% by default; set the rate to 0 to rely on OpenTelemetry tracing only.
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  dataCollection: sentryPiiSafeDataCollection,
  beforeSend: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
});

/** App Router navigations become Sentry spans (Sentry's required hook). */
export const onRouterTransitionStart = captureRouterTransitionStart;
