/**
 * LGPD-oriented Sentry privacy helpers shared by the web and API SDKs.
 *
 * Two layers, both intentionally conservative:
 *
 *  1. `sentryPiiSafeDataCollection` disables every Sentry v10 `dataCollection`
 *     category. Every category must be listed: once `dataCollection` is set,
 *     the SDK abandons its conservative legacy defaults and fills any omitted
 *     field from the permissive spec defaults (cookies, headers and bodies on).
 *
 *  2. `scrubSentryEvent` / `scrubSentryBreadcrumb` are last-resort `beforeSend`
 *     filters. They drop the user, request and extra payloads wholesale and
 *     redact CPF/CNPJ, e-mail, phone and card patterns from free text.
 *
 * Pure and dependency-free: no Sentry import, so both `@sentry/bun` (APIs) and
 * `@sentry/nextjs` (web) consumers can share it. Structural types describe only
 * the fields the scrubber touches.
 */

/** Breadcrumb fields the scrubber touches. */
export interface ScrubbableBreadcrumb {
  message?: string;
  data?: object;
}

/** Exception value fields the scrubber touches. */
export interface ScrubbableExceptionValue {
  value?: string;
}

/** Event fields the scrubber touches. */
export interface ScrubbableEvent {
  user?: object;
  request?: object;
  extra?: object;
  message?: string;
  logentry?: { message?: string };
  exception?: { values?: ScrubbableExceptionValue[] };
  breadcrumbs?: ScrubbableBreadcrumb[];
}

const EMAIL_PATTERN = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g;

const CPF_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

const CNPJ_PATTERN = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;

const PHONE_PATTERN = /(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}\b/g;

/** Grouped in fours so a phone number (+55 11 98888-7777) is not read as a card. */
const CARD_PATTERN = /\b\d{4}(?:[ -]?\d{4}){2,4}\b/g;

/**
 * Conservative Sentry v10 data collection. Every field is explicit because an
 * omitted field falls back to the permissive spec default once `dataCollection`
 * is provided.
 */
export const sentryPiiSafeDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 5,
};

/** Replace detected PII patterns in free text with a stable placeholder. */
export function scrubPiiText(text: string): string {
  return text
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(CPF_PATTERN, "[redacted-cpf]")
    .replace(CNPJ_PATTERN, "[redacted-cnpj]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(CARD_PATTERN, "[redacted-card]");
}

/**
 * Drop wholesale PII carriers from a Sentry event and redact its text fields
 * in place. `extra` is dropped entirely rather than deep-scrubbed: arbitrary
 * app data cannot be reliably classified, and Sentry's own stack/context
 * metadata already carries the debuggable signal.
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user;
  delete event.request;
  delete event.extra;

  if (event.message) {
    event.message = scrubPiiText(event.message);
  }

  if (event.logentry?.message) {
    event.logentry.message = scrubPiiText(event.logentry.message);
  }

  for (const value of event.exception?.values ?? []) {
    if (value.value) {
      value.value = scrubPiiText(value.value);
    }
  }

  for (const breadcrumb of event.breadcrumbs ?? []) {
    scrubSentryBreadcrumb(breadcrumb);
  }

  return event;
}

/** Drop a breadcrumb payload (console args, fetch bodies) and redact its message. */
export function scrubSentryBreadcrumb<T extends ScrubbableBreadcrumb>(breadcrumb: T): T {
  delete breadcrumb.data;

  if (breadcrumb.message) {
    breadcrumb.message = scrubPiiText(breadcrumb.message);
  }

  return breadcrumb;
}
