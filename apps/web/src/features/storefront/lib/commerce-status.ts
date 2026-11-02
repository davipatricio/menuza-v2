/**
 * The commerce health read, as the storefront card consumes it.
 *
 * Declared here rather than derived from `@/server/server-api.ts` so a client
 * component never even type-imports a server-only module.
 */
export type CommerceStatus =
  | { ok: true; data: { service: string; timestamp: string } }
  | { ok: false; error: string };
