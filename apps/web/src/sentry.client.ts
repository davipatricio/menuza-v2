/**
 * Sentry no navegador.
 *
 * Sem integração de framework: `@sentry/react` inicializa uma única vez, no
 * escopo do módulo, e o guarda do DSN mantém tudo desligado quando ele está
 * vazio — nunca um DSN falso. O DSN do cliente é público por desenho; a
 * redução de PII vem de `@menuza/shared/sentry-privacy`.
 */
import * as Sentry from "@sentry/react";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  sentryPiiSafeDataCollection,
} from "@menuza/shared/sentry-privacy";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV ?? import.meta.env.MODE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    dataCollection: sentryPiiSafeDataCollection,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
  });
}
