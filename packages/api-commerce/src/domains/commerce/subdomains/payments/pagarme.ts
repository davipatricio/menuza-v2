/**
 * Pagar.me Core API v5 adapter.
 *
 * Re-exports the client and webhook adapter from `@menuza/pagarme-api-client`.
 */
export {
  PAGARME_BASE_URL,
  type PagarMeAction,
  type PagarMeCredentials,
  type PagarMeEvent,
  mapPagarMeEventType,
  pagarMeRequest,
  parsePagarMeCredentials,
  parsePagarMeEvent,
  verifyPagarMeAuthorization,
} from "@menuza/pagarme-api-client";
