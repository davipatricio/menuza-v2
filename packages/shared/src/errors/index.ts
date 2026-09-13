/**
 * Canonical RPC error codes shared across commerce and tenant APIs.
 * Apps extend via `oc.errors({ ...sharedErrorCodes, ...appSpecific })`.
 * (Do NOT spread a builder: `oc.errors()` returns an oRPC builder that does
 * not satisfy `ErrorMap` — spreading it nests a `~orpc` key and breaks the
 * contract. Spread the raw catalog object.)
 *
 * Messages are PT-BR (single locale, matches the domain glossary).
 */
export const sharedErrorCodes = {
  TENANT_NOT_RESOLVED: {
    message: "Não foi possível identificar o tenant da requisição.",
  },
  UNAUTHORIZED: {
    message: "Sessão ausente ou inválida.",
  },
  FORBIDDEN: {
    message: "Operação não autorizada para esta sessão.",
  },
  NOT_FOUND: {
    message: "Recurso não encontrado.",
  },
  CONFLICT: {
    message: "Conflito de estado.",
  },
  VALIDATION_FAILED: {
    message: "Dados de entrada inválidos.",
  },
  RATE_LIMITED: {
    message: "Limite de requisições excedido.",
  },
  INTERNAL: {
    message: "Erro interno inesperado.",
  },
} as const;

export type SharedErrorCode = keyof typeof sharedErrorCodes;

export { isFourXxCode } from "./severity.ts";
