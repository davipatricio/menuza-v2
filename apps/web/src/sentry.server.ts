/**
 * Sentry no servidor.
 *
 * Importado só por `src/server.ts`, o entry do servidor, então nunca entra no
 * bundle do navegador. Sem DSN o SDK fica desligado; com DSN, a redução de PII
 * vem de `@menuza/shared/sentry-privacy`.
 */
import * as Sentry from "@sentry/node";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryPiiSafeDataCollection,
} from "@menuza/shared/sentry-privacy";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    dataCollection: sentryPiiSafeDataCollection,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  });
}
